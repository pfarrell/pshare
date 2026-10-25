import { useEffect } from 'react';
import { usePlayerStore } from '../../stores/playerStore';
import { useAuthStore } from '../../stores/authStore';
import { apiService } from '../../services/api';
import { isIOSDevice } from '../../utils/device';
import { isJukeboxMode } from '../../jukebox/jukeboxMode';
import { createSpotifySdkAdapter } from './spotifySdk';
import { createSpotifySource } from './spotifySource';
import { canPlaySpotify } from './eligibility';
import { getSpotifyStatusCached, invalidateSpotifyStatus } from './statusCache';
import { SPOTIFY_POLL_MS, SPOTIFY_END_LEAD_MS, PREFETCH_THRESHOLD_SECONDS } from './constants';

// SDK state has to disagree with the store's isPlaying on this many polls in a row before the
// store is corrected, so a just-issued pause/resume has time to show up in SDK state.
const IS_PLAYING_MISMATCH_POLLS = 2;
// Within this much of the end, a poll arms the end-of-track timeout: the next poll would land
// past the SPOTIFY_END_LEAD_MS window.
const END_WINDOW_MS = SPOTIFY_POLL_MS + SPOTIFY_END_LEAD_MS;
// A paused state this close to 0 right after the track was near its end means it finished.
const END_RESET_POSITION_MS = 1000;
// With no poll inside END_WINDOW_MS (background tabs throttle timers to ~1s), the end is still
// recognised from the last poll that saw the track within this much of its end.
const LATE_END_WINDOW_MS = PREFETCH_THRESHOLD_SECONDS * 1000;

// Connects this page as a Spotify playback device (experimental, #72) and registers it with
// the player store as its SpotifySource, when the signed-in session can play Spotify. While a
// Spotify track is the active source, polls SDK state to drive progress, buffering, isPlaying,
// prefetch of the next local track, and the advance at the end of the track.
// Every failure here is silent (console only): the store just skips Spotify tracks.
export const useSpotifyPlayback = () => {
  const userId = useAuthStore((s) => s.user?.id ?? null);
  const activeSource = usePlayerStore((s) => s.activeSource);
  const spotifySource = usePlayerStore((s) => s.spotifySource);

  useEffect(() => {
    if (userId == null) return undefined;
    let cancelled = false;
    let adapter = null;
    let source = null;
    let tokenRequest = null;

    const register = () => {
      if (!cancelled && source) usePlayerStore.getState().setSpotifySource(source);
    };
    const unregister = () => {
      if (source && usePlayerStore.getState().spotifySource === source) {
        usePlayerStore.getState().setSpotifySource(null);
      }
    };

    // A fresh token on every call (the backend refreshes near expiry); concurrent callers
    // share one in-flight request so near-expiry refreshes don't race on the backend.
    const getOAuthToken = () => {
      if (!tokenRequest) {
        tokenRequest = apiService.getSpotifyToken()
          .then((response) => {
            const token = response?.data?.accessToken;
            if (!token) throw new Error('No Spotify access token');
            return token;
          })
          .catch((error) => {
            console.warn('Spotify token unavailable:', error);
            throw error;
          })
          .finally(() => { tokenRequest = null; });
      }
      return tokenRequest;
    };

    const handleDisplaced = () => {
      // Another device took the Spotify session over. Never take it back automatically: carry
      // on with local tracks via an auto advance, which skips Spotify entries while displaced
      // (and stops as though the queue ended if only Spotify tracks remain). A manual play or
      // skip onto a Spotify track clears the displaced flag and takes the stream back.
      const store = usePlayerStore.getState();
      if (store.activeSource === 'spotify' && store.spotifySource === source) store.playNext();
    };

    const loseDevice = (reason) => (detail) => {
      console.warn(`Spotify ${reason}:`, detail);
      source?.setDeviceId(null);
      unregister();
    };

    (async () => {
      const status = await getSpotifyStatusCached();
      if (cancelled) return;
      if (!canPlaySpotify({ status, isSecureContext: window.isSecureContext, isIOS: isIOSDevice() })) return;

      adapter = createSpotifySdkAdapter({ name: isJukeboxMode() ? 'P·Share Jukebox' : 'P·Share', getOAuthToken });
      source = createSpotifySource(adapter, { onDisplaced: handleDisplaced });
      await adapter.load();
      if (cancelled) return;
      adapter.onNotReady(loseDevice('device went offline'));
      adapter.onAuthError(loseDevice('authentication error'));
      adapter.onAccountError(loseDevice('account error'));
      adapter.onPlaybackError((error) => console.warn('Spotify playback error:', error));
      adapter.onReady((deviceId) => {
        source.setDeviceId(deviceId);
        register();
      });
      const deviceId = await adapter.connect();
      if (cancelled) return;
      source.setDeviceId(deviceId);
      register();
    })().catch((error) => console.warn('Spotify playback unavailable:', error));

    return () => {
      cancelled = true;
      unregister();
      try {
        adapter?.disconnect();
      } catch (error) {
        console.warn('Spotify disconnect failed:', error);
      }
      // A different user (or none) may follow; their status is fetched fresh.
      invalidateSpotifyStatus();
    };
  }, [userId]);

  // Polls while Spotify is the active source, paused included, so isPlaying is corrected if a
  // pause or resume was rejected by the SDK.
  //
  // End of track: polls are SPOTIFY_POLL_MS apart, wider than the SPOTIFY_END_LEAD_MS window,
  // so a poll can't be relied on to land inside it. Once a poll sees the track within one poll
  // interval of the end, a timeout is scheduled for the lead point; and if the track has
  // already ended by the next look (paused back at 0, another uri, or no state), that counts as
  // the end too. When throttled timers mean no poll lands that close (background tabs), the last
  // playing poll stands in: see looksEndedLate. endFired keeps it to one advance per track.
  useEffect(() => {
    if (activeSource !== 'spotify' || !spotifySource?.getState) return undefined;
    let polling = false;
    let endFired = false;
    let mismatches = 0;
    // { uri, track } from the last poll that saw the track playing within the end window.
    let nearEnd = null;
    // { uri, track, positionMs, durationMs } from the last poll that saw the current track
    // playing. Cleared by a pause, a seek or a track change, like the end timeout.
    let lastSeen = null;
    let endTimer = null;
    let applyingPoll = false;

    const clearEndTimer = () => {
      clearTimeout(endTimer);
      endTimer = null;
    };

    const fireEnd = (store) => {
      endFired = true;
      nearEnd = null;
      lastSeen = null;
      clearEndTimer();
      store.playNext();
    };

    // Whether `state` shows the near-end track finished: no state, a different uri (Spotify
    // autoplayed something), or paused back at the start or at the very end.
    const looksEnded = (state, uri) => !state
      || state.uri !== uri
      || (state.paused && (state.positionMs < END_RESET_POSITION_MS || state.positionMs >= state.durationMs - SPOTIFY_END_LEAD_MS));

    // Ended although no poll landed in the end window: the last playing poll was close to the
    // end and now the track is gone (paused back at 0, another uri, no state); or Spotify moved
    // on to another uri after the track was more than half played.
    const looksEndedLate = (state, track) => {
      if (!lastSeen || lastSeen.track !== track) return false;
      const { uri, positionMs, durationMs } = lastSeen;
      const otherUri = !!state && state.uri !== uri;
      if (otherUri && positionMs > durationMs / 2) return true;
      return durationMs - positionMs <= LATE_END_WINDOW_MS
        && (!state || otherUri || (state.paused && state.positionMs < END_RESET_POSITION_MS));
    };

    // The store still expects this track to be playing on this source, with nothing in flight.
    const stillExpected = (store, track) => store.activeSource === 'spotify'
      && store.spotifySource === spotifySource
      && store.isPlaying
      && store.currentTrack === track
      && spotifySource.isSettled?.();

    const scheduleEnd = (remainingMs, uri, track) => {
      clearEndTimer();
      endTimer = setTimeout(async () => {
        endTimer = null;
        if (endFired || !stillExpected(usePlayerStore.getState(), track)) return;
        let state;
        try {
          state = await spotifySource.getState();
        } catch (error) {
          console.warn('Spotify state poll failed:', error);
          return;
        }
        const store = usePlayerStore.getState();
        if (endFired || !stillExpected(store, track)) return;
        const stillNearEnd = state?.uri === uri && !state.paused
          && state.durationMs - state.positionMs <= END_WINDOW_MS;
        if (stillNearEnd || looksEnded(state, uri)) fireEnd(store);
      }, Math.max(0, remainingMs - SPOTIFY_END_LEAD_MS));
    };

    const apply = (state) => {
      const store = usePlayerStore.getState();
      if (store.activeSource !== 'spotify' || store.spotifySource !== spotifySource) return;
      // Commands in flight: SDK state may still describe the previous request.
      if (!spotifySource.isSettled?.()) return;
      const track = store.currentTrack;
      if (nearEnd && nearEnd.track !== track) nearEnd = null;
      if (lastSeen && lastSeen.track !== track) lastSeen = null;
      if (!endFired && store.isPlaying
        && ((nearEnd && looksEnded(state, nearEnd.uri)) || looksEndedLate(state, track))) {
        fireEnd(store);
        return;
      }
      // State for a different track: the requested one hasn't started yet.
      if (!state || state.uri !== track?.uri) return;

      applyingPoll = true;
      store.setCurrentTime(state.positionMs / 1000);
      if (state.durationMs > 0) store.setDuration(state.durationMs / 1000);
      store.setBuffering(!!state.loading);
      applyingPoll = false;

      const sdkPlaying = !state.paused;
      if (!state.loading && sdkPlaying !== store.isPlaying) {
        mismatches += 1;
        if (mismatches >= IS_PLAYING_MISMATCH_POLLS) {
          mismatches = 0;
          store.setIsPlaying(sdkPlaying);
        }
      } else {
        mismatches = 0;
      }

      if (state.paused || state.durationMs <= 0) return;
      lastSeen = { uri: state.uri, track, positionMs: state.positionMs, durationMs: state.durationMs };
      const remainingMs = state.durationMs - state.positionMs;
      // Re-arm only once clearly away from the end (e.g. repeat-one restarted the track).
      if (remainingMs > END_WINDOW_MS) endFired = false;
      nearEnd = remainingMs <= END_WINDOW_MS ? { uri: state.uri, track } : null;
      if (remainingMs <= PREFETCH_THRESHOLD_SECONDS * 1000) store.ensureStandbyLoaded();
      if (endFired) return;
      if (remainingMs <= SPOTIFY_END_LEAD_MS) fireEnd(store);
      else if (nearEnd) scheduleEnd(remainingMs, state.uri, track);
      else clearEndTimer();
    };

    const poll = async () => {
      if (polling) return;
      polling = true;
      try {
        apply(await spotifySource.getState());
      } catch (error) {
        console.warn('Spotify state poll failed:', error);
      } finally {
        polling = false;
      }
    };

    // A pause, a seek (any currentTime change not made by a poll) or a track change cancels a
    // pending end timeout and forgets the last playing position; the next poll re-establishes
    // both if they still apply.
    const unsubscribe = usePlayerStore.subscribe((next, prev) => {
      if (!endTimer && !lastSeen) return;
      if (next.currentTrack !== prev.currentTrack
        || (prev.isPlaying && !next.isPlaying)
        || (!applyingPoll && next.currentTime !== prev.currentTime)) {
        clearEndTimer();
        lastSeen = null;
      }
    });

    const timer = setInterval(poll, SPOTIFY_POLL_MS);
    return () => {
      clearInterval(timer);
      clearEndTimer();
      unsubscribe();
    };
  }, [activeSource, spotifySource]);
};

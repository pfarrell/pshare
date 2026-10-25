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
            source?.setTokenFailed(false);
            return token;
          })
          .catch((error) => {
            console.warn('Spotify token unavailable:', error);
            source?.setTokenFailed(true);
            throw error;
          })
          .finally(() => { tokenRequest = null; });
      }
      return tokenRequest;
    };

    const handleDisplaced = () => {
      // Another device took the Spotify session over. Show it as paused here; a manual play
      // takes it back (the store clears the displaced flag on manual starts).
      if (usePlayerStore.getState().activeSource === 'spotify') {
        usePlayerStore.getState().setIsPlaying(false);
      }
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
  useEffect(() => {
    if (activeSource !== 'spotify' || !spotifySource?.getState) return undefined;
    let polling = false;
    let endFired = false;
    let mismatches = 0;

    const apply = (state) => {
      const store = usePlayerStore.getState();
      if (!state || store.activeSource !== 'spotify' || store.spotifySource !== spotifySource) return;
      // Commands in flight: SDK state may still describe the previous request.
      if (!spotifySource.isSettled?.()) return;
      // State for a different track: the requested one hasn't started yet.
      if (state.uri !== store.currentTrack?.uri) return;

      store.setCurrentTime(state.positionMs / 1000);
      if (state.durationMs > 0) store.setDuration(state.durationMs / 1000);
      store.setBuffering(!!state.loading);

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
      const remainingMs = state.durationMs - state.positionMs;
      if (remainingMs > SPOTIFY_END_LEAD_MS) endFired = false;
      if (remainingMs <= PREFETCH_THRESHOLD_SECONDS * 1000) store.ensureStandbyLoaded();
      if (remainingMs <= SPOTIFY_END_LEAD_MS && !endFired) {
        endFired = true;
        store.playNext();
      }
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

    const timer = setInterval(poll, SPOTIFY_POLL_MS);
    return () => clearInterval(timer);
  }, [activeSource, spotifySource]);
};

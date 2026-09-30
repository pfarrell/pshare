import { useEffect, useRef } from 'react';
import { usePlayerStore } from '../stores/playerStore';
import { apiService, jukeboxEventsUrl } from '../services/api';
import { invalidateProfilesCache } from '../utils/profilesCache';
import { requestJukeboxStatePublish } from './jukeboxStatePublisher';

// Opens one EventSource for the kiosk's own device and reconciles both event
// types the stream carries — see
// docs/superpowers/specs/2026-09-25-jukebox-server-queue-design.md Design §3.
// Call unconditionally; pass null until a deviceId is known.
export const useJukeboxQueueEvents = (deviceId) => {
  const deliveredIds = useRef(new Set());

  useEffect(() => {
    if (deviceId == null) return;

    // Resolves a batch of submissions to tracks and appends them to the
    // player queue in one call, preserving submission order regardless of
    // the order their individual getTrack requests resolve over the
    // network. A single live queue-item-added event is just a batch of
    // size 1, so it goes through this same path.
    const deliverBatch = async (submissions) => {
      const toDeliver = submissions.filter((s) => !deliveredIds.current.has(s.id));
      if (toDeliver.length === 0) return;
      // Mark as handled synchronously, before awaiting anything, so a
      // concurrent call (e.g. a queue-item-added event arriving mid-fetch)
      // can't double-deliver the same submission.
      toDeliver.forEach((s) => deliveredIds.current.add(s.id));

      const results = await Promise.allSettled(
        toDeliver.map((s) => apiService.getTrack(s.track_id))
      );

      const tracks = [];
      results.forEach((result, i) => {
        if (result.status === 'fulfilled') {
          tracks.push(result.value.data.track);
        } else {
          // Failed lookup (transient 5xx, network blip, deleted track):
          // un-mark it so a future catch-up (on the next 'open', see below)
          // retries it instead of permanently blacklisting it.
          deliveredIds.current.delete(toDeliver[i].id);
        }
      });

      if (tracks.length > 0) {
        usePlayerStore.getState().addTracks(tracks);
      }

      results.forEach((result, i) => {
        if (result.status === 'fulfilled') {
          // Wrapped in Promise.resolve() rather than calling .catch() directly:
          // a bare vi.fn() mock (as used by this hook's own tests, which assert
          // markJukeboxDelivered was called but don't stub a return value)
          // returns undefined, and undefined.catch() would throw an unhandled
          // rejection even though the call itself succeeded.
          Promise.resolve(apiService.markJukeboxDelivered(deviceId, toDeliver[i].id)).catch(() => {});
        }
      });
    };

    // EventSource's native browser auto-reconnect does not re-run this
    // effect, so the pending-queue catch-up fetch must be driven by the
    // 'open' event rather than run once at effect-setup time — 'open' fires
    // on the initial connection AND on every subsequent reconnect (network
    // blip, or routine idle-connection churn), covering both cases the
    // design spec calls out. The dedupe Set above makes a repeat fetch safe.
    const fetchPending = () => {
      apiService.getJukeboxPendingQueue(deviceId)
        .then((res) => deliverBatch(res.data))
        .catch(() => {});
    };

    // Remote control from a logged-in phone: the same three transport actions
    // the footer buttons call, and nothing else. Anything unrecognized or
    // malformed is dropped silently; the kiosk must never throw on a stray event.
    const handlePlaybackCommand = (event) => {
      let payload;
      try {
        payload = JSON.parse(event.data);
      } catch {
        return;
      }
      const command = payload?.command;
      const { togglePlayPause, playNext, playPrev, playTrackAtIndex, removeTrackFromPlaylist, playlist } = usePlayerStore.getState();

      if (command === 'toggle') togglePlayPause();
      else if (command === 'next') playNext({ manual: true });
      else if (command === 'prev') playPrev();
      else if (command === 'jump' || command === 'remove') {
        const { index, trackId } = payload;
        // The phone addressed a row it saw a moment ago. Act only if that row
        // still holds that exact track (duplicates and reshuffles can't fool
        // this); otherwise do nothing and republish so the phone shows the truth.
        const valid = Number.isInteger(index) && index >= 0 && Number.isInteger(trackId) && playlist[index]?.id === trackId;
        if (valid) {
          if (command === 'jump') playTrackAtIndex(index);
          else removeTrackFromPlaylist(index);
        }
        requestJukeboxStatePublish();
      }
    };

    // The browser only retries on its own for dropped connections. If the server
    // answers with a non-200 (nginx returns 502 while the API restarts on a
    // deploy), the EventSource goes CLOSED for good and the kiosk silently stops
    // listening, so phones see "not connected". Rebuild it ourselves with backoff.
    const EVENT_SOURCE_CLOSED = 2;
    let source = null;
    let retryTimer = null;
    let retryDelay = 2000;

    const connect = () => {
      source = new EventSource(jukeboxEventsUrl(deviceId), { withCredentials: true });
      // 'open' fires on the initial connection and every reconnect (including
      // after a server restart, which drops the in-memory queue snapshot).
      source.addEventListener('open', () => {
        retryDelay = 2000;
        fetchPending();
        requestJukeboxStatePublish();
      });
      source.addEventListener('error', () => {
        if (source.readyState !== EVENT_SOURCE_CLOSED) return; // browser is retrying
        source.close();
        retryTimer = setTimeout(connect, retryDelay);
        retryDelay = Math.min(retryDelay * 2, 30000);
      });
      source.addEventListener('queue-item-added', (event) => deliverBatch([JSON.parse(event.data)]));
      source.addEventListener('profiles-changed', () => invalidateProfilesCache());
      source.addEventListener('playback-command', handlePlaybackCommand);
    };
    connect();

    return () => {
      clearTimeout(retryTimer);
      source.close();
    };
  }, [deviceId]);
};

import { useEffect, useRef } from 'react';
import { usePlayerStore } from '../stores/playerStore';
import { apiService, jukeboxEventsUrl } from '../services/api';
import { invalidateProfilesCache } from '../utils/profilesCache';

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

    const source = new EventSource(jukeboxEventsUrl(deviceId), { withCredentials: true });
    source.addEventListener('open', fetchPending);
    source.addEventListener('queue-item-added', (event) => deliverBatch([JSON.parse(event.data)]));
    source.addEventListener('profiles-changed', () => invalidateProfilesCache());

    return () => source.close();
  }, [deviceId]);
};

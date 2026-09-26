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

    const deliver = async (submission) => {
      if (deliveredIds.current.has(submission.id)) return;
      deliveredIds.current.add(submission.id);
      const { data } = await apiService.getTrack(submission.track_id);
      usePlayerStore.getState().addTracks([data.track]);
      // Wrapped in Promise.resolve() rather than calling .catch() directly:
      // a bare vi.fn() mock (as used by this hook's own tests, which assert
      // markJukeboxDelivered was called but don't stub a return value)
      // returns undefined, and undefined.catch() would throw an unhandled
      // rejection even though the call itself succeeded.
      Promise.resolve(apiService.markJukeboxDelivered(deviceId, submission.id)).catch(() => {});
    };

    apiService.getJukeboxPendingQueue(deviceId)
      .then((res) => res.data.forEach(deliver))
      .catch(() => {});

    const source = new EventSource(jukeboxEventsUrl(deviceId), { withCredentials: true });
    source.addEventListener('queue-item-added', (event) => deliver(JSON.parse(event.data)));
    source.addEventListener('profiles-changed', () => invalidateProfilesCache());

    return () => source.close();
  }, [deviceId]);
};

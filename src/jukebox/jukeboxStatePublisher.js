import { useEffect } from 'react';
import { usePlayerStore } from '../stores/playerStore';
import { apiService } from '../services/api';

// Kiosk side of the phone Queue page: publishes what is queued (the current
// track onward, never history) so phones can show it. See
// docs/superpowers/specs/2026-09-30-jukebox-phone-queue-design.md.
export const PUBLISH_THROTTLE_MS = 1500;
const MAX_QUEUE_ENTRIES = 300;

export const buildQueueSnapshot = ({ playlist, currentTrackIndex, isPlaying }) => {
  const list = playlist ?? [];
  const start = Math.max(currentTrackIndex ?? -1, 0);
  const queue = list.slice(start, start + MAX_QUEUE_ENTRIES).map((t, i) => ({
    index: start + i,
    id: t?.id,
    title: typeof t?.title === 'string' ? t.title : '',
    artist: typeof t?.artist?.name === 'string' && t.artist.name ? t.artist.name : null,
  }));
  return { queue, currentIndex: list.length ? (currentTrackIndex ?? -1) : -1, isPlaying: !!isPlaying };
};

// Set while the hook is mounted, so code elsewhere (the event-stream hook) can
// force an immediate publish without owning the timer.
let flush = null;
export const requestJukeboxStatePublish = () => flush?.();

// Call unconditionally; pass null until a deviceId is known.
export const useJukeboxStatePublisher = (deviceId) => {
  useEffect(() => {
    if (deviceId == null) return undefined;

    let timer = null;
    let lastPublishedAt = 0;

    const publish = () => {
      timer = null;
      lastPublishedAt = Date.now();
      // Fire and forget: a failed publish just means the phone's view is a
      // little stale until the next change or reconnect.
      Promise.resolve(apiService.publishJukeboxState(deviceId, buildQueueSnapshot(usePlayerStore.getState())))
        .catch(() => {});
    };

    const schedule = () => {
      if (timer) return;
      const wait = Math.max(0, PUBLISH_THROTTLE_MS - (Date.now() - lastPublishedAt));
      timer = setTimeout(publish, wait);
    };

    const unsubscribe = usePlayerStore.subscribe((state, prev) => {
      if (
        state.playlist !== prev.playlist
        || state.currentTrackIndex !== prev.currentTrackIndex
        || state.isPlaying !== prev.isPlaying
      ) {
        schedule();
      }
    });

    flush = () => {
      clearTimeout(timer);
      publish();
    };
    publish();

    return () => {
      unsubscribe();
      clearTimeout(timer);
      flush = null;
    };
  }, [deviceId]);
};

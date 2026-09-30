import { useEffect } from 'react';
import { usePlayerStore } from '../stores/playerStore';
import { apiService } from '../services/api';

// Kiosk side of the phone Queue page: publishes what is queued (the current
// track onward, never history) so phones can show it. See
// docs/superpowers/specs/2026-09-30-jukebox-phone-queue-design.md.
export const PUBLISH_THROTTLE_MS = 1500;
const MAX_QUEUE_ENTRIES = 300;

const toEntry = (track, index) => ({
  index,
  id: track?.id,
  title: typeof track?.title === 'string' ? track.title : '',
  artist: typeof track?.artist?.name === 'string' && track.artist.name ? track.artist.name : null,
});

// What the phone shows. Normally that is the current track onward, in queue
// order. Plain shuffle does NOT play in queue order (the next track is picked at
// random from everything not yet played), so there the list is the current track
// followed by every track still left to play, still addressed by real playlist
// index so jump/remove hit the right row. The mode rides along so the phone can
// say so instead of implying an order.
export const buildQueueSnapshot = ({ playlist, currentTrackIndex, isPlaying, playbackMode, shuffleHistory }) => {
  const list = playlist ?? [];
  const mode = playbackMode ?? 'off';
  const current = currentTrackIndex ?? -1;

  const indices = [];
  if (mode === 'shuffle') {
    const played = new Set(shuffleHistory ?? []);
    if (current >= 0 && current < list.length) indices.push(current);
    for (let i = 0; i < list.length; i += 1) {
      if (i !== current && !played.has(i)) indices.push(i);
    }
  } else {
    for (let i = Math.max(current, 0); i < list.length; i += 1) indices.push(i);
  }

  return {
    queue: indices.slice(0, MAX_QUEUE_ENTRIES).map((i) => toEntry(list[i], i)),
    currentIndex: list.length ? current : -1,
    isPlaying: !!isPlaying,
    playbackMode: mode,
  };
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
        || state.playbackMode !== prev.playbackMode
        || state.shuffleHistory !== prev.shuffleHistory
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

// src/hooks/useQueueActions.js
import { useState } from 'react';
import { usePlayerStore } from '../stores/playerStore';

// Play / Play Next / Add to Queue for a set of tracks that is either already
// loaded (a page) or fetched on demand (a card). `play()` always appends the
// tracks to the end of the current queue and jumps straight to the first
// newly-added one, interrupting whatever was playing — it never silently
// no-ops and never clears what was queued before it.
export const useQueueActions = (source, { queueSource, errorLabel = 'Failed to load tracks' } = {}) => {
  const addTracks = usePlayerStore((s) => s.addTracks);
  const setQueueSource = usePlayerStore((s) => s.setQueueSource);
  const [loading, setLoading] = useState(false);

  const run = async (dispatch, { tagSource = false } = {}) => {
    let tracks = source;
    if (typeof source === 'function') {
      setLoading(true);
      try {
        tracks = await source();
      } catch (err) {
        console.error(errorLabel, err);
        return;
      } finally {
        setLoading(false);
      }
    }
    if (!tracks?.length) return;
    dispatch(tracks);
    if (tagSource && queueSource) setQueueSource(queueSource);
  };

  return {
    loading,
    play: () => run((t) => addTracks(t, false, { flashActivity: true, playImmediately: true }), { tagSource: true }),
    playNext: () => run((t) => addTracks(t, true, { flashActivity: true })),
    addToQueue: () => run((t) => addTracks(t, false, { flashActivity: true })),
  };
};

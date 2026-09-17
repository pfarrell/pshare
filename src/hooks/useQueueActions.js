// src/hooks/useQueueActions.js
import { useState } from 'react';
import { usePlayerStore } from '../stores/playerStore';

// Play / Play Now / Play Next / Add to Queue for a set of tracks that is
// either already loaded (a page) or fetched on demand (a card). Play and
// Add to Queue are deliberately identical: Play appends and only starts
// playback when idle, so it never interrupts what's playing (a55e8d0).
export const useQueueActions = (source, { afterEnqueue, errorLabel = 'Failed to load tracks' } = {}) => {
  const addTracks = usePlayerStore((s) => s.addTracks);
  const setPlaylist = usePlayerStore((s) => s.setPlaylist);
  const [loading, setLoading] = useState(false);

  const run = async (dispatch) => {
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
    afterEnqueue?.();
  };

  return {
    loading,
    playAll: () => run((t) => addTracks(t, false, { flashActivity: true })),
    playNow: () => run((t) => setPlaylist(t)),
    playNext: () => run((t) => addTracks(t, true, { flashActivity: true })),
    addToQueue: () => run((t) => addTracks(t, false, { flashActivity: true })),
  };
};

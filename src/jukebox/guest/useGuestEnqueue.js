import { useState, useRef, useCallback, useEffect } from 'react';
import { apiService } from '../../services/api';
import { getStoredGuestName } from '../../utils/jukeboxGuestName';

const CHUNK = 500;
const RESET_MS = 2000;
const IDLE = { state: 'idle', count: 0 };

// Per-item add state for the guest UI. `enqueue` takes either the track ids
// or a function that resolves them (used for the artist/collection "Shuffle"
// and album/playlist "Add all", where the ids come from a guest endpoint), and
// submits them in chunks so one tap can add more than the server's
// per-request cap. With { spotify: true } the items are Spotify tracks (#72,
// the /search/spotify track shape) instead of library ids.
export const useGuestEnqueue = (token) => {
  const [statuses, setStatuses] = useState({});
  const timers = useRef({});

  useEffect(() => () => Object.values(timers.current).forEach(clearTimeout), []);

  const setStatus = useCallback((key, state, count = 0) => {
    clearTimeout(timers.current[key]);
    setStatuses((prev) => ({ ...prev, [key]: { state, count } }));
    if (state !== 'adding') {
      timers.current[key] = setTimeout(() => {
        setStatuses((prev) => ({ ...prev, [key]: IDLE }));
      }, RESET_MS);
    }
  }, []);

  const enqueue = useCallback(async (key, source, { spotify = false } = {}) => {
    setStatus(key, 'adding');
    try {
      const ids = typeof source === 'function' ? await source() : source;
      if (!ids?.length) {
        setStatus(key, 'empty');
        return;
      }
      setStatus(key, 'adding', ids.length);
      const name = getStoredGuestName();
      for (let i = 0; i < ids.length; i += CHUNK) {
        const chunk = ids.slice(i, i + CHUNK);
        if (spotify) await apiService.submitSpotifyToJukebox(token, chunk, name);
        else await apiService.submitToJukebox(token, chunk, name);
      }
      setStatus(key, 'added');
    } catch (err) {
      const status = err?.response?.status;
      setStatus(key, status === 429 ? 'slow' : status === 409 && spotify ? 'unavailable' : 'error');
    }
  }, [token, setStatus]);

  const statusFor = useCallback((key) => statuses[key] ?? IDLE, [statuses]);

  return { enqueue, statusFor };
};

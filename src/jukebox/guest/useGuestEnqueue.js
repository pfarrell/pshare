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
// per-request cap.
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

  const enqueue = useCallback(async (key, source) => {
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
        await apiService.submitToJukebox(token, ids.slice(i, i + CHUNK), name);
      }
      setStatus(key, 'added');
    } catch (err) {
      setStatus(key, err?.response?.status === 429 ? 'slow' : 'error');
    }
  }, [token, setStatus]);

  const statusFor = useCallback((key) => statuses[key] ?? IDLE, [statuses]);

  return { enqueue, statusFor };
};

import { useState, useEffect, useCallback } from 'react';
import { apiService } from '../../services/api';

export const QUEUE_POLL_MS = 3000;

// Polls the kiosk queue for the Queue page: every few seconds while the page is
// visible, immediately when it becomes visible again, never while hidden, and
// not at all after unmount. A transient failure keeps the last good data.
export const useGuestQueue = (token) => {
  const [state, setState] = useState({ data: null, error: null, loading: true });

  const refresh = useCallback(async () => {
    try {
      const res = await apiService.getJukeboxQueue(token);
      setState({ data: res.data, error: null, loading: false });
    } catch (error) {
      setState((prev) => ({ data: prev.data, error, loading: false }));
    }
  }, [token]);

  useEffect(() => {
    refresh();
    const visible = () => document.visibilityState === 'visible';
    const timer = setInterval(() => { if (visible()) refresh(); }, QUEUE_POLL_MS);
    const onVisibility = () => { if (visible()) refresh(); };
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      clearInterval(timer);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [refresh]);

  return { ...state, refresh, notFound: state.error?.response?.status === 404 };
};

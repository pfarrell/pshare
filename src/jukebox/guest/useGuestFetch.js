import { useEffect, useState } from 'react';

// Fetch-on-mount for guest pages. `fetcher` returns an axios promise.
// `notFound` is true for a 404 (bad token or missing entity).
export const useGuestFetch = (fetcher, deps) => {
  const [state, setState] = useState({ data: null, error: null, loading: true });
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setState({ data: null, error: null, loading: true });
    fetcher()
      .then((res) => { if (!cancelled) setState({ data: res.data, error: null, loading: false }); })
      .catch((error) => { if (!cancelled) setState({ data: null, error, loading: false }); });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, attempt]);

  return { ...state, retry: () => setAttempt((n) => n + 1), notFound: state.error?.response?.status === 404 };
};

import { useCallback, useEffect, useRef, useState } from 'react';

// Loads data for a page: refetches when `deps` change or reload() is called,
// and ignores responses from a fetch that has since been superseded (fast
// navigation between two albums must not show the first album's data).
export const useFetch = (fetcher, deps) => {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [reloadKey, setReloadKey] = useState(0);
  const fetcherRef = useRef(fetcher);
  useEffect(() => { fetcherRef.current = fetcher; });

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    // Call the fetcher synchronously so this effect uses this render's
    // fetcher (the ref-sync effect above has already run); a deferred call
    // could pick up a later render's fetcher instead.
    let request;
    try {
      request = Promise.resolve(fetcherRef.current());
    } catch (err) {
      request = Promise.reject(err);
    }
    request
      .then((result) => { if (!cancelled) setData(result); })
      .catch((err) => {
        console.error('useFetch:', err);
        if (!cancelled) setError(err);
      })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, reloadKey]);

  const reload = useCallback(() => setReloadKey((k) => k + 1), []);

  return { data, setData, loading, error, reload };
};

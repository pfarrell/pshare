import { useState, useRef, useCallback, useEffect } from 'react';
import { useHomeFeedStore, getHomeFeedCache } from '../stores/homeFeedStore';

const BATCH_SIZE_DESKTOP  = 30;
const WINDOW_SIZE_DESKTOP = 180;
const BATCH_SIZE_MOBILE   = 20;
const WINDOW_SIZE_MOBILE  = 120;
const COOLDOWN_MS         = 2000;

export function useInfiniteItems(fetchFn, cacheKey) {
  // Frozen at mount on purpose (not useIsMobile): batch/window sizes feed the
  // offset math for already-loaded items, so they must not change mid-life.
  const isMobile   = useRef(window.matchMedia('(max-width: 768px)').matches).current;
  const batchSize  = isMobile ? BATCH_SIZE_MOBILE  : BATCH_SIZE_DESKTOP;
  const windowSize = isMobile ? WINDOW_SIZE_MOBILE : WINDOW_SIZE_DESKTOP;

  // Store fetchFn in a ref so loadMore stays stable even when caller
  // passes a new arrow function on every render.
  const fetchFnRef = useRef(fetchFn);
  fetchFnRef.current = fetchFn;

  // Only consult the cache once, at mount — later cache writes from this
  // same instance must not flip `hydrated` mid-life.
  const cached   = useRef(cacheKey ? getHomeFeedCache(cacheKey) : null).current;
  const hydrated = cached !== null && cached.items.length > 0;

  const [items,     setItems]     = useState(cached ? cached.items : []);
  const [isLoading, setIsLoading] = useState(false);
  const [hasMore,   setHasMore]   = useState(cached ? cached.hasMore : true);
  const [error,     setError]     = useState(null);

  const seenIds          = useRef(cached ? new Set(cached.seenIds) : new Set());
  const loadingRef       = useRef(false);
  const hasMoreRef       = useRef(cached ? cached.hasMore : true);
  const itemsRef         = useRef(cached ? cached.items : []);
  const cooldownTimerRef = useRef(null);

  const updateItems = useCallback((next) => {
    itemsRef.current = next;
    setItems(next);
  }, []);

  useEffect(() => {
    return () => {
      if (cooldownTimerRef.current) clearTimeout(cooldownTimerRef.current);
    };
  }, []);

  // Persist items/hasMore back to the shared cache so a later remount
  // under the same key (e.g. browser back-navigation) can hydrate
  // instead of fetching a new random batch.
  useEffect(() => {
    if (!cacheKey) return;
    useHomeFeedStore.getState().save(cacheKey, { items, hasMore, seenIds: new Set(seenIds.current) });
  }, [cacheKey, items, hasMore]);

  const loadMore = useCallback(async (gridRef) => {
    if (loadingRef.current || !hasMoreRef.current) return;
    loadingRef.current = true;
    setIsLoading(true);

    try {
      const response = await fetchFnRef.current(batchSize);
      const rawBatch = response.data;

      if (rawBatch.length < batchSize) {
        hasMoreRef.current = false;
        setHasMore(false);
      }

      const newItems = rawBatch.filter(a => !seenIds.current.has(a.id));
      newItems.forEach(a => seenIds.current.add(a.id));

      if (newItems.length === 0) {
        hasMoreRef.current = false;
        setHasMore(false);
        cooldownTimerRef.current = setTimeout(() => {
          hasMoreRef.current = true;
          setHasMore(true);
        }, COOLDOWN_MS);
        return;
      }

      const combined = [...itemsRef.current, ...newItems];

      let sliced = combined;
      if (combined.length > windowSize && gridRef?.current) {
        const trimCount = combined.length - windowSize;
        const container = gridRef.current;
        const card      = container.querySelector('.artist-card, .result-row');

        if (card) {
          const cardRect    = card.getBoundingClientRect();
          const gapPx       = parseFloat(getComputedStyle(container).rowGap) || 0;
          const colCount    = Math.round((container.offsetWidth + gapPx) / (cardRect.width + gapPx));
          const rowsDropped = Math.ceil(trimCount / colCount);
          const pixelDelta  = rowsDropped * (cardRect.height + gapPx);
          const mainContent = document.querySelector('.main-content');
          if (mainContent) mainContent.scrollTop -= pixelDelta;
        }

        sliced = combined.slice(combined.length - windowSize);
      }

      updateItems(sliced);
    } catch (err) {
      console.error('Failed to load items:', err);
      setError('Failed to load');
    } finally {
      loadingRef.current = false;
      setIsLoading(false);
    }
  }, [batchSize, windowSize, updateItems]);

  return { items, isLoading, hasMore, error, loadMore, hydrated };
}

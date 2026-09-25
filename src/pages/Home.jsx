// src/pages/Home.jsx
import { useEffect, useRef } from 'react';
import { useInfiniteItems } from '../hooks/useInfiniteItems';
import { useHomeModeStore } from '../stores/homeModeStore';
import { useProfileFilterStore } from '../stores/profileFilterStore';
import { useHomeFeedStore } from '../stores/homeFeedStore';
import { apiService } from '../services/api';
import ArtistGrid from '../components/ArtistGrid';
import AlbumGrid from '../components/AlbumGrid';
import Loading from '../components/Loading';
import Retry from '../components/Retry';

const HomeFeed = ({ mode, activeProfileId }) => {
  const cacheKey = `${mode}:${activeProfileId ?? ''}`;
  const fetchFn = mode === 'albums'
    ? (size) => apiService.getRandomAlbums(size, activeProfileId)
    : (size) => apiService.getRandomArtists(size, activeProfileId);

  const { items, isLoading, error, loadMore, hydrated } = useInfiniteItems(fetchFn, cacheKey);
  const gridRef     = useRef(null);
  const sentinelRef = useRef(null);

  // Restore scroll position on a cache hit (browser back-navigation);
  // scroll to top on a genuinely fresh load (mode/tag switch, or an
  // explicit refresh that already invalidated the cache). Capture the
  // final scroll position back into the cache on unmount so the next
  // cache hit can restore it.
  useEffect(() => {
    const mainContent = document.querySelector('.main-content');
    if (!mainContent) return;
    mainContent.scrollTop = hydrated ? useHomeFeedStore.getState().scrollTop : 0;

    return () => {
      useHomeFeedStore.getState().save(cacheKey, { scrollTop: mainContent.scrollTop });
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Initial load — skipped when hydrated from cache
  useEffect(() => {
    if (!hydrated) loadMore(gridRef);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Infinite scroll: re-run when items.length changes so the observer
  // picks up the real sentinel after the initial <Loading> unmounts.
  useEffect(() => {
    const sentinel = sentinelRef.current;
    if (!sentinel) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting) loadMore(gridRef);
      },
      {
        root: document.querySelector('.main-content'),
        threshold: 0,
      }
    );

    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [loadMore, items.length]);

  if (items.length === 0 && isLoading) {
    return <Loading message={`Loading ${mode}`} />;
  }

  if (error && items.length === 0) {
    return <Retry error={error} />;
  }

  return (
    <>
      {mode === 'albums'
        ? <AlbumGrid albums={items} gridRef={gridRef} sentinelRef={sentinelRef} />
        : <ArtistGrid artists={items} imageContext="artist_search" gridRef={gridRef} sentinelRef={sentinelRef} />
      }
      {isLoading && (
        <div style={{ display: 'flex', justifyContent: 'center', padding: '1.5rem' }}>
          <div className="loading-spinner" />
        </div>
      )}
    </>
  );
};

const Home = () => {
  const { mode } = useHomeModeStore();
  const { activeProfileId } = useProfileFilterStore();
  return <HomeFeed key={`${mode}:${activeProfileId ?? ''}`} mode={mode} activeProfileId={activeProfileId} />;
};

export default Home;

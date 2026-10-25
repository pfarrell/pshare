// src/pages/Search.jsx
import { useState, useEffect, useRef, useCallback } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { apiService } from '../services/api';
import { useAuthStore } from '../stores/authStore';
import { useProfileFilterStore } from '../stores/profileFilterStore';
import Loading from '../components/Loading';
import Track from '../components/Track';
import SearchResultCard from '../components/SearchResultCard';
import SearchTypeFilterPills from '../components/SearchTypeFilterPills';
import CardGrid from '../components/CardGrid';
import SpotifyResults from '../components/SpotifyResults';
import { useCanPlaySpotify } from '../player/spotify/useCanPlaySpotify';
import { visibleSpotifyResults, spotifyItemCount } from '../utils/spotifyResults';

const EMPTY_COUNTS = { album: 0, artist: 0, playlist: 0, collection: 0 };
const PAGE_SIZE = 30;

const Search = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();
  const { isAdmin } = useAuthStore();
  const { activeProfileId } = useProfileFilterStore();
  const [results, setResults] = useState({ results: [], tracks: [] });
  const [resultCounts, setResultCounts] = useState(EMPTY_COUNTS);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState(null);
  const [loadMoreError, setLoadMoreError] = useState(null);
  const [activeTypes, setActiveTypes] = useState(new Set());

  const query = searchParams.get('q') || '';
  const seenRef = useRef(new Set());
  const offsetRef = useRef(0);
  // The page size the backend actually used for this query, read from the
  // initial response's `pageSize` field so the frontend never has to keep
  // its own PAGE_SIZE constant in lockstep with the backend's RESULT_LIMIT —
  // falls back to the local PAGE_SIZE constant only if the field is missing.
  const pageSizeRef = useRef(PAGE_SIZE);
  const sentinelRef = useRef(null);
  // Bumped at the start of every performSearch call. loadMore captures the
  // current value before its fetch and checks it again after — if a new
  // search started in between, the value has moved on and the now-stale
  // loadMore response is dropped instead of being merged into the new
  // query's results.
  const searchGenerationRef = useRef(0);
  // Spotify results for the current query: { loading, data } where data is
  // the /search/spotify body, or null when unconfigured/failed/not yet back.
  const [spotify, setSpotify] = useState({ loading: false, data: null });
  // "Spotify" pill: show only Spotify results, including ones the library
  // already has (see toggleSpotifyOnly). Per-search, never persisted.
  const [spotifyOnly, setSpotifyOnly] = useState(false);

  // Whether Spotify results can be played in-page (#72).
  const canPlay = useCanPlaySpotify();

  // Fired alongside (not after) the local search and never awaited, so local
  // results render as soon as they arrive. First page only — loadMore never
  // calls this. Any failure (unconfigured, 400/429/502, network) just hides
  // the section: Spotify is a nice-to-have, never worth an error message.
  const fetchSpotify = async (searchQuery, generation) => {
    setSpotify({ loading: true, data: null });
    try {
      const response = await apiService.searchSpotify(searchQuery);
      if (generation !== searchGenerationRef.current) return; // superseded by a new search
      const data = response?.data;
      setSpotify({ loading: false, data: data?.configured ? data : null });
    } catch (err) {
      if (generation !== searchGenerationRef.current) return;
      if (err?.response?.status === 429) {
        console.warn('Spotify search rate limited; retry after', err.response.data?.retryAfter ?? 'unknown', 's');
      } else {
        console.error('Spotify search error:', err);
      }
      setSpotify({ loading: false, data: null });
    }
  };

  const performSearch = async (searchQuery) => {

    if (!searchQuery.trim()) return;

    searchGenerationRef.current += 1;
    setLoading(true);
    setError(null);
    setLoadMoreError(null);
    setSpotifyOnly(false);
    fetchSpotify(searchQuery, searchGenerationRef.current);

    try {
      const response = await apiService.search(searchQuery, undefined, activeProfileId);
      const data = response.data;
      setResults(data);
      setResultCounts(data.resultCounts || EMPTY_COUNTS);
      setHasMore(!!data.hasMore);
      setActiveTypes(new Set());

      seenRef.current = new Set((data.results || []).map((r) => `${r.type}:${r.data.id}`));
      pageSizeRef.current = data.pageSize || PAGE_SIZE;
      offsetRef.current = pageSizeRef.current;

      if (searchQuery !== query) {
        setSearchParams({ q: searchQuery });
      }
    } catch (error) {
      const err = error
      console.error('Search error:', err);
      if(err.response && err.response.data) {
        setError(`${err.response.data}`)
      } else {
        setError('Search failed. Please try again.');
      }
    } finally {
      setLoading(false);
    }
  };

  // activeProfileId is a dependency because the header chip is on this page
  // too: switching profiles while already on /search must re-run the search
  // rather than leave results filtered by the previous profile.
  useEffect(() => {
    if (query) {
      performSearch(query);
    }
  }, [query, activeProfileId]);

  const loadMore = useCallback(async () => {
    if (loadingMore || !hasMore || !query) return;
    const generation = searchGenerationRef.current;
    setLoadingMore(true);
    setLoadMoreError(null);

    try {
      const response = await apiService.search(query, offsetRef.current, activeProfileId);
      if (generation !== searchGenerationRef.current) return; // superseded by a new search
      const data = response.data;
      const fresh = (data.results || []).filter((r) => !seenRef.current.has(`${r.type}:${r.data.id}`));
      fresh.forEach((r) => seenRef.current.add(`${r.type}:${r.data.id}`));

      setResults((prev) => ({ ...prev, results: [...prev.results, ...fresh] }));
      // resultCounts is not re-read here: the initial performSearch response
      // is already the source of truth, and the total doesn't change from
      // page to page of the same query — re-setting it from a loadMore
      // response would just be redundant (and the backend doesn't bother
      // recomputing it for offset > 0 requests either, see search.ts).
      setHasMore(!!data.hasMore);
      offsetRef.current += pageSizeRef.current;
    } catch (err) {
      console.error('Load more search results error:', err);
      // Deliberately a separate error state from `error`: `error` drives a
      // full-page takeover that unmounts the results grid, which would wipe
      // out everything already loaded over a single flaky page-2 fetch and
      // leave no sentinel to retry with. loadMoreError renders inline instead
      // so the existing results, pills, and sentinel all stay in place.
      setLoadMoreError('Failed to load more results.');
    } finally {
      setLoadingMore(false);
    }
  }, [loadingMore, hasMore, query, activeProfileId]);

  useEffect(() => {
    const sentinel = sentinelRef.current;
    if (!sentinel || !hasMore) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting) loadMore();
      },
      {
        root: document.querySelector('.main-content'),
        threshold: 0,
      }
    );

    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [hasMore, loadMore]);

  // The Spotify pill and the type pills are mutually exclusive views rather
  // than combinable filters (type pills only apply to local results, which
  // Spotify-only mode hides): turning Spotify on clears the type selection,
  // and picking a type pill turns Spotify-only off.
  const toggleSpotifyOnly = () => {
    if (!spotifyOnly) setActiveTypes(new Set());
    setSpotifyOnly(!spotifyOnly);
  };

  const toggleType = (type) => {
    setSpotifyOnly(false);
    setActiveTypes((prev) => {
      const next = new Set(prev);
      if (next.has(type)) {
        next.delete(type);
      } else {
        next.add(type);
      }
      return next;
    });
  };

  if (loading) {
    return (
      <Loading message="Searching" />
    );
  }

  if (error) {
    return (
      <div style={{ textAlign: 'center', padding: '3rem' }}>
        <p style={{ color: '#ef4444', fontSize: '1.125rem' }}>{error}</p>
      </div>
    );
  }

  if (!query) {
    return (
      <div style={{ textAlign: 'center', padding: '3rem' }}>
        <p style={{ color: 'var(--color-text-muted)' }}>Enter a search term to find music</p>
      </div>
    );
  }

  const allResults = results.results || [];
  const filteredResults = activeTypes.size === 0
    ? allResults
    : allResults.filter((r) => activeTypes.has(r.type));
  // When a type filter is active, the heading must total only the active
  // types — otherwise it disagrees with what's actually visible in the grid
  // below it (a pre-existing, deliberate UX property: filtering to "Albums"
  // should make the heading read the album count, not the grand total).
  const totalResultCount = activeTypes.size === 0
    ? Object.values(resultCounts).reduce((sum, n) => sum + n, 0)
    : [...activeTypes].reduce((sum, type) => sum + (resultCounts[type] || 0), 0);
  // spotify.data is only non-null when Spotify is configured and responded.
  const spotifyCount = spotifyItemCount(spotify.data);
  const showLocal = !spotifyOnly;

  return (
    <div style={{ padding: '.5rem', maxWidth: '1400px', margin: '0 auto' }}>
      <SearchTypeFilterPills
        counts={allResults.length > 0 ? resultCounts : EMPTY_COUNTS}
        activeTypes={activeTypes}
        onToggle={toggleType}
      >
        {spotifyCount > 0 && (
          <button
            type="button"
            className={`search-type-pill${spotifyOnly ? ' active' : ''}`}
            aria-pressed={spotifyOnly}
            onClick={toggleSpotifyOnly}
          >
            Spotify {spotifyCount}
          </button>
        )}
      </SearchTypeFilterPills>

      {/* Ranked results: albums, artists, playlists, collections, interleaved by confidence */}
      {showLocal && allResults.length > 0 && (
        <div className="search-section">
          <h2 className="search-section-title">Results ({totalResultCount})</h2>
          <div className="artist-grid" style={{ padding: '0' }}>
            <CardGrid>
              {filteredResults.map((result) => (
                <SearchResultCard
                  key={`${result.type}-${result.data.id}`}
                  type={result.type}
                  data={result.data}
                  onNavigate={navigate}
                  getImageUrl={apiService.getImageUrl}
                />
              ))}
            </CardGrid>
          </div>
          {hasMore && <div ref={sentinelRef} style={{ height: '1px' }} />}
          {loadingMore && (
            <div style={{ display: 'flex', justifyContent: 'center', padding: '1.5rem' }}>
              <div className="loading-spinner" />
            </div>
          )}
          {loadMoreError && (
            <p style={{ textAlign: 'center', color: '#ef4444', padding: '1rem' }}>{loadMoreError}</p>
          )}
        </div>
      )}

      {/* Tracks Section */}
      {showLocal && results.tracks && results.tracks.length > 0 && (
        <div className="search-section">
          <h2 className="search-section-title">Tracks ({results.tracks.length})</h2>
          <div className="track-list">
            {results.tracks.map((track, index) => (
              <Track key={track.id} track={track} index={index} trackCount={results.tracks.length} includeMeta={true} showEdit={isAdmin}/>
            ))}
          </div>
        </div>
      )}

      {/* No results */}
      {showLocal && results.results?.length === 0 && results.tracks?.length === 0 && (
        <div style={{ textAlign: 'center', padding: '3rem' }}>
          <p style={{ color: 'var(--color-text-muted)' }}>No results found for "{query}"</p>
        </div>
      )}

      {/* External Spotify results: by default minus anything the library
          already has (server-matched localId); everything in Spotify-only mode */}
      {spotify.loading ? (
        <SpotifyResults loading />
      ) : spotify.data && (
        <SpotifyResults {...visibleSpotifyResults(spotify.data, { includeLibraryMatches: spotifyOnly })} canPlay={canPlay} />
      )}
    </div>
  );
};

export default Search;

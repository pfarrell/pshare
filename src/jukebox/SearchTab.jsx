import { useState, useEffect, useRef } from 'react';
import { apiService } from '../services/api';
import JukeboxAlbumTile from './JukeboxAlbumTile';
import JukeboxArtistTile from './JukeboxArtistTile';
import JukeboxPlaylistTile from './JukeboxPlaylistTile';
import JukeboxCollectionTile from './JukeboxCollectionTile';
import Track from '../components/Track';

// Artists, albums, playlists and collections all drill into a browse view
// (via onSelectArtist/onSelectAlbum/onSelectPlaylist/onSelectCollection, all
// owned by JukeboxBrowsePanel) rather than being dead taps — Jukebox Mode has
// no <Routes> to navigate a playlist/collection result to, unlike the desktop
// UI. See docs/superpowers/specs/2026-09-20-jukebox-mode-design.md §4.
//
// A real query returns far more than fits on screen (dozens of albums, a
// hundred-plus tracks), so results are organized by type: the "All" view shows
// a short preview of each type under a heading with a "See all" shortcut, and
// the chips below the search field filter to a single type in full.
const PREVIEW_COUNTS = { artists: 6, albums: 4, playlists: 4, collections: 4, tracks: 5 };

// Incremental search: how long to wait after the last keystroke before
// firing, and the shortest query worth firing for at all (skips a request on
// the very first character of a fresh query).
const DEBOUNCE_MS = 350;
const MIN_INCREMENTAL_LENGTH = 2;

// The exact count past this point isn't useful and costs a wider column —
// only the underlying number (not this capped display) drives "See all" and
// chip-count logic, so nothing downstream needs to know about the cap.
const COUNT_CAP = 100;
const displayCount = (n) => (n > COUNT_CAP ? `${COUNT_CAP}+` : String(n));

const Section = ({ title, count, previewCount, onSeeAll, children }) => (
  <section className="jukebox-search-section">
    <div className="jukebox-search-section-header">
      <h3>{title}</h3>
      {count > previewCount && (
        <button type="button" onClick={onSeeAll}>{`See all (${displayCount(count)})`}</button>
      )}
    </div>
    {children}
  </section>
);

const SearchTab = ({ onSelectArtist, onSelectAlbum, onSelectPlaylist, onSelectCollection, onEnqueue }) => {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState(null);
  const [error, setError] = useState(false);
  const [filter, setFilter] = useState('all'); // 'all' | 'artists' | 'albums' | 'playlists' | 'collections' | 'tracks'

  // Guards against a slow earlier request's response landing after a faster
  // later one and clobbering it — only the response matching the most
  // recently *dispatched* request is ever applied.
  const searchGenerationRef = useRef(0);
  // True once a search has fired for the query currently being typed (reset
  // when the box goes back to empty) — lets an incremental refinement tell
  // itself apart from the start of a brand new search, so only the latter
  // resets the type filter back to All.
  const hasStartedQueryRef = useRef(false);

  const runSearch = async (q, { resetFilter } = { resetFilter: true }) => {
    if (!q.trim()) return;
    setError(false);
    const generation = ++searchGenerationRef.current;
    try {
      const response = await apiService.search(q);
      if (generation !== searchGenerationRef.current) return; // superseded by a newer search
      setResults(response.data);
      if (resetFilter) setFilter('all');
    } catch {
      if (generation !== searchGenerationRef.current) return;
      setError(true);
    }
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    hasStartedQueryRef.current = true;
    runSearch(query, { resetFilter: true });
  };

  // Fires the search automatically as the query settles, so hitting the
  // Search button is an option rather than a requirement.
  useEffect(() => {
    const trimmed = query.trim();
    if (trimmed.length === 0) {
      hasStartedQueryRef.current = false; // cleared back to empty — the next query is a fresh start
      return undefined;
    }
    if (trimmed.length < MIN_INCREMENTAL_LENGTH) return undefined;

    const timer = setTimeout(() => {
      const isFreshSearch = !hasStartedQueryRef.current;
      hasStartedQueryRef.current = true;
      runSearch(query, { resetFilter: isFreshSearch });
    }, DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [query]);

  const artistResults = (results?.results || []).filter((r) => r.type === 'artist');
  const albumResults = (results?.results || []).filter((r) => r.type === 'album');
  const playlistResults = (results?.results || []).filter((r) => r.type === 'playlist');
  const collectionResults = (results?.results || []).filter((r) => r.type === 'collection');
  // Track (src/components/Track.jsx) unconditionally reads track.artist.id —
  // every other caller in the app always supplies at least a placeholder
  // artist object. Search results don't guarantee an `artist` field on
  // tracks, so normalize here rather than changing Track.jsx's contract for
  // all its callers.
  const trackResults = (results?.tracks || []).map((t) => ({ artist: {}, ...t }));

  const counts = {
    artists: artistResults.length,
    albums: albumResults.length,
    playlists: playlistResults.length,
    collections: collectionResults.length,
    tracks: trackResults.length,
  };
  const noResults = results !== null
    && counts.artists + counts.albums + counts.playlists + counts.collections + counts.tracks === 0;

  const renderArtists = (list) => (
    <div className="jukebox-artist-grid">
      {list.map((r) => (
        <JukeboxArtistTile
          key={r.data.id}
          artist={r.data}
          imageUrl={apiService.getImageUrl(r.data.image_path, 'artist_search')}
          onSelect={onSelectArtist}
        />
      ))}
    </div>
  );

  const renderAlbums = (list) => (
    <div className="jukebox-album-grid">
      {list.map((r) => (
        <JukeboxAlbumTile
          key={r.data.id}
          album={r.data}
          imageUrl={apiService.getImageUrl(r.data.image_path, 'album_small')}
          onSelect={onSelectAlbum}
        />
      ))}
    </div>
  );

  const renderPlaylists = (list) => (
    <div className="jukebox-album-grid">
      {list.map((r) => (
        <JukeboxPlaylistTile
          key={r.data.id}
          playlist={r.data}
          imageUrl={apiService.getImageUrl(r.data.image_path, 'album_small')}
          onSelect={onSelectPlaylist}
        />
      ))}
    </div>
  );

  const renderCollections = (list) => (
    <div className="jukebox-album-grid">
      {list.map((r) => (
        <JukeboxCollectionTile
          key={r.data.id}
          collection={r.data}
          imageUrl={apiService.getImageUrl(r.data.image_path, 'album_small')}
          onSelect={onSelectCollection}
        />
      ))}
    </div>
  );

  // No includeMeta: it renders "from <album> by <artist>" links that
  // navigate() to /album/:id and /artist/:id — dead taps here (Jukebox Mode
  // has no <Routes>) that just pile up history entries. Track still appends
  // " - <artist>" to the title line when the track artist differs from the
  // album artist, so nothing informative is lost.
  // Track has no onClick prop of its own — a capture-phase listener here
  // fires before Track's internal tap-to-enqueue handlers, so it catches
  // every track tap regardless of which element inside the row was tapped.
  const renderTracks = (list) => (
    <div className="jukebox-search-tracks" onClickCapture={() => onEnqueue?.()}>
      {list.map((track, index) => (
        <Track key={track.id} track={track} index={index} trackCount={list.length} />
      ))}
    </div>
  );

  // A chip for a type with nothing to show is omitted entirely rather than
  // shown disabled — "All" is the only one not tied to a single type's count
  // (whenever the chip bar shows at all, at least one type is non-empty, or
  // "No results" would be showing instead).
  const chips = [
    { key: 'all', label: 'All' },
    counts.artists > 0 && { key: 'artists', label: `Artists (${displayCount(counts.artists)})` },
    counts.albums > 0 && { key: 'albums', label: `Albums (${displayCount(counts.albums)})` },
    counts.playlists > 0 && { key: 'playlists', label: `Playlists (${displayCount(counts.playlists)})` },
    counts.collections > 0 && { key: 'collections', label: `Collections (${displayCount(counts.collections)})` },
    counts.tracks > 0 && { key: 'tracks', label: `Tracks (${displayCount(counts.tracks)})` },
  ].filter(Boolean);

  // A refinement can make the currently-selected type's count drop to zero
  // (its chip just disappeared above) — fall back to All rather than render
  // an empty, unreachable-by-chip view.
  const effectiveFilter = filter === 'all' || counts[filter] > 0 ? filter : 'all';

  return (
    <div className="jukebox-search-tab">
      <div className="jukebox-search-bar">
        <form role="search" onSubmit={handleSubmit}>
          <input
            placeholder="Search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          <button type="submit">Search</button>
        </form>

        {results !== null && !noResults && !error && (
          <div className="jukebox-search-chips" role="group" aria-label="Filter results">
            {chips.map((chip) => (
              <button
                key={chip.key}
                type="button"
                aria-pressed={effectiveFilter === chip.key}
                onClick={() => setFilter(chip.key)}
              >
                {chip.label}
              </button>
            ))}
          </div>
        )}
      </div>

      {error && (
        <div className="jukebox-panel-error">
          <p>Search failed.</p>
          <button type="button" onClick={() => runSearch(query)}>Retry</button>
        </div>
      )}

      {!error && results === null && <p className="jukebox-panel-empty">Search for something to play</p>}
      {!error && noResults && <p className="jukebox-panel-empty">No results</p>}

      {!error && results !== null && !noResults && effectiveFilter === 'all' && (
        <>
          {counts.artists > 0 && (
            <Section title="Artists" count={counts.artists} previewCount={PREVIEW_COUNTS.artists} onSeeAll={() => setFilter('artists')}>
              {renderArtists(artistResults.slice(0, PREVIEW_COUNTS.artists))}
            </Section>
          )}
          {counts.albums > 0 && (
            <Section title="Albums" count={counts.albums} previewCount={PREVIEW_COUNTS.albums} onSeeAll={() => setFilter('albums')}>
              {renderAlbums(albumResults.slice(0, PREVIEW_COUNTS.albums))}
            </Section>
          )}
          {counts.playlists > 0 && (
            <Section title="Playlists" count={counts.playlists} previewCount={PREVIEW_COUNTS.playlists} onSeeAll={() => setFilter('playlists')}>
              {renderPlaylists(playlistResults.slice(0, PREVIEW_COUNTS.playlists))}
            </Section>
          )}
          {counts.collections > 0 && (
            <Section title="Collections" count={counts.collections} previewCount={PREVIEW_COUNTS.collections} onSeeAll={() => setFilter('collections')}>
              {renderCollections(collectionResults.slice(0, PREVIEW_COUNTS.collections))}
            </Section>
          )}
          {counts.tracks > 0 && (
            <Section title="Tracks" count={counts.tracks} previewCount={PREVIEW_COUNTS.tracks} onSeeAll={() => setFilter('tracks')}>
              {renderTracks(trackResults.slice(0, PREVIEW_COUNTS.tracks))}
            </Section>
          )}
        </>
      )}
      {!error && results !== null && !noResults && effectiveFilter === 'artists' && renderArtists(artistResults)}
      {!error && results !== null && !noResults && effectiveFilter === 'albums' && renderAlbums(albumResults)}
      {!error && results !== null && !noResults && effectiveFilter === 'playlists' && renderPlaylists(playlistResults)}
      {!error && results !== null && !noResults && effectiveFilter === 'collections' && renderCollections(collectionResults)}
      {!error && results !== null && !noResults && effectiveFilter === 'tracks' && renderTracks(trackResults)}
    </div>
  );
};

export default SearchTab;

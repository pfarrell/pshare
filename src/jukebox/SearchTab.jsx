import { useState } from 'react';
import { apiService } from '../services/api';
import JukeboxAlbumTile from './JukeboxAlbumTile';
import JukeboxArtistTile from './JukeboxArtistTile';
import Track from '../components/Track';

// Playlist/collection results are filtered out — they're navigate-to-a-page
// on the desktop UI, and Jukebox Mode has no pages to navigate to. Artists
// and albums instead drill into a browse view (via onSelectArtist/
// onSelectAlbum, owned by JukeboxBrowsePanel) rather than being dead taps.
// See docs/superpowers/specs/2026-09-20-jukebox-mode-design.md §4.
//
// A real query returns far more than fits on screen (dozens of albums, a
// hundred-plus tracks), so results are organized by type: the "All" view shows
// a short preview of each type under a heading with a "See all" shortcut, and
// the chips below the search field filter to a single type in full.
const PREVIEW_COUNTS = { artists: 6, albums: 4, tracks: 5 };

const Section = ({ title, count, previewCount, onSeeAll, children }) => (
  <section className="jukebox-search-section">
    <div className="jukebox-search-section-header">
      <h3>{title}</h3>
      {count > previewCount && (
        <button type="button" onClick={onSeeAll}>{`See all (${count})`}</button>
      )}
    </div>
    {children}
  </section>
);

const SearchTab = ({ onSelectArtist, onSelectAlbum }) => {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState(null);
  const [error, setError] = useState(false);
  const [filter, setFilter] = useState('all'); // 'all' | 'artists' | 'albums' | 'tracks'

  const runSearch = async (q) => {
    if (!q.trim()) return;
    setError(false);
    try {
      const response = await apiService.search(q);
      setResults(response.data);
      setFilter('all');
    } catch {
      setError(true);
    }
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    runSearch(query);
  };

  const artistResults = (results?.results || []).filter((r) => r.type === 'artist');
  const albumResults = (results?.results || []).filter((r) => r.type === 'album');
  // Track (src/components/Track.jsx) unconditionally reads track.artist.id —
  // every other caller in the app always supplies at least a placeholder
  // artist object. Search results don't guarantee an `artist` field on
  // tracks, so normalize here rather than changing Track.jsx's contract for
  // all its callers.
  const trackResults = (results?.tracks || []).map((t) => ({ artist: {}, ...t }));

  const counts = { artists: artistResults.length, albums: albumResults.length, tracks: trackResults.length };
  const noResults = results !== null && counts.artists + counts.albums + counts.tracks === 0;

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

  // No includeMeta: it renders "from <album> by <artist>" links that
  // navigate() to /album/:id and /artist/:id — dead taps here (Jukebox Mode
  // has no <Routes>) that just pile up history entries. Track still appends
  // " - <artist>" to the title line when the track artist differs from the
  // album artist, so nothing informative is lost.
  const renderTracks = (list) => (
    <div className="jukebox-search-tracks">
      {list.map((track, index) => (
        <Track key={track.id} track={track} index={index} trackCount={list.length} />
      ))}
    </div>
  );

  const chips = [
    { key: 'all', label: 'All', disabled: false },
    { key: 'artists', label: `Artists (${counts.artists})`, disabled: counts.artists === 0 },
    { key: 'albums', label: `Albums (${counts.albums})`, disabled: counts.albums === 0 },
    { key: 'tracks', label: `Tracks (${counts.tracks})`, disabled: counts.tracks === 0 },
  ];

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
                aria-pressed={filter === chip.key}
                disabled={chip.disabled}
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

      {!error && results !== null && !noResults && filter === 'all' && (
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
          {counts.tracks > 0 && (
            <Section title="Tracks" count={counts.tracks} previewCount={PREVIEW_COUNTS.tracks} onSeeAll={() => setFilter('tracks')}>
              {renderTracks(trackResults.slice(0, PREVIEW_COUNTS.tracks))}
            </Section>
          )}
        </>
      )}
      {!error && results !== null && !noResults && filter === 'artists' && renderArtists(artistResults)}
      {!error && results !== null && !noResults && filter === 'albums' && renderAlbums(albumResults)}
      {!error && results !== null && !noResults && filter === 'tracks' && renderTracks(trackResults)}
    </div>
  );
};

export default SearchTab;

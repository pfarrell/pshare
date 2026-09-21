import { useState } from 'react';
import { apiService } from '../services/api';
import AlbumCard from '../components/AlbumCard';
import Track from '../components/Track';

// Only album and track results are playable in one tap on the desktop UI
// too (artist/playlist/collection results are navigate-to-a-page there) —
// Jukebox Mode has no pages to navigate to, so those types are filtered out
// entirely rather than shown as dead taps. See
// docs/superpowers/specs/2026-09-20-jukebox-mode-design.md §4.
const SearchTab = () => {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState(null);
  const [error, setError] = useState(false);

  const runSearch = async (q) => {
    if (!q.trim()) return;
    setError(false);
    try {
      const response = await apiService.search(q);
      setResults(response.data);
    } catch {
      setError(true);
    }
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    runSearch(query);
  };

  const albumResults = (results?.results || []).filter((r) => r.type === 'album');
  // Track (src/components/Track.jsx) unconditionally reads track.artist.id —
  // every other caller in the app always supplies at least a placeholder
  // artist object. Search results don't guarantee an `artist` field on
  // tracks, so normalize here rather than changing Track.jsx's contract for
  // all its callers.
  const trackResults = (results?.tracks || []).map((t) => ({ artist: {}, ...t }));

  return (
    <div className="jukebox-search-tab">
      <form role="search" onSubmit={handleSubmit}>
        <input
          placeholder="Search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        <button type="submit">Search</button>
      </form>

      {error && (
        <div className="jukebox-panel-error">
          <p>Search failed.</p>
          <button type="button" onClick={() => runSearch(query)}>Retry</button>
        </div>
      )}

      {!error && results === null && <p className="jukebox-panel-empty">Search for something to play</p>}

      {!error && results !== null && (
        <>
          {albumResults.length > 0 && (
            <div className="jukebox-search-albums">
              {albumResults.map((r) => (
                <AlbumCard
                  key={r.data.id}
                  album={r.data}
                  artist={r.data.artist}
                  imageUrl={apiService.getImageUrl(r.data.image_path, 'album_small')}
                  onClick={() => {}}
                />
              ))}
            </div>
          )}
          {trackResults.length > 0 && (
            <div className="jukebox-search-tracks">
              {trackResults.map((track, index) => (
                <Track key={track.id} track={track} index={index} trackCount={trackResults.length} includeMeta />
              ))}
            </div>
          )}
          {albumResults.length === 0 && trackResults.length === 0 && (
            <p className="jukebox-panel-empty">No results</p>
          )}
        </>
      )}
    </div>
  );
};

export default SearchTab;

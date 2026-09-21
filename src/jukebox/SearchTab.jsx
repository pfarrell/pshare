import { useState } from 'react';
import { apiService } from '../services/api';
import AlbumCard from '../components/AlbumCard';
import ArtistCard from '../components/ArtistCard';
import Track from '../components/Track';

// Playlist/collection results are filtered out — they're navigate-to-a-page
// on the desktop UI, and Jukebox Mode has no pages to navigate to. Artists
// and albums instead drill into a browse view (via onSelectArtist/
// onSelectAlbum, owned by JukeboxBrowsePanel) rather than being dead taps.
// See docs/superpowers/specs/2026-09-20-jukebox-mode-design.md §4.
const SearchTab = ({ onSelectArtist, onSelectAlbum }) => {
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

  const artistResults = (results?.results || []).filter((r) => r.type === 'artist');
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
          {artistResults.length > 0 && (
            <div className="jukebox-search-albums">
              {artistResults.map((r) => (
                <ArtistCard
                  key={r.data.id}
                  artist={r.data}
                  imageUrl={apiService.getImageUrl(r.data.image_path, 'artist_search')}
                  onClick={(artist) => onSelectArtist(artist)}
                />
              ))}
            </div>
          )}
          {albumResults.length > 0 && (
            <div className="jukebox-search-albums">
              {albumResults.map((r) => (
                <AlbumCard
                  key={r.data.id}
                  album={r.data}
                  artist={r.data.artist}
                  imageUrl={apiService.getImageUrl(r.data.image_path, 'album_small')}
                  onClick={(album) => onSelectAlbum(album)}
                />
              ))}
            </div>
          )}
          {trackResults.length > 0 && (
            <div className="jukebox-search-tracks">
              {trackResults.map((track, index) => (
                // No includeMeta: it renders "from <album> by <artist>" links
                // that navigate() to /album/:id and /artist/:id — dead taps
                // here (Jukebox Mode has no <Routes>) that just pile up
                // history entries. Track still appends " - <artist>" to the
                // title line when the track artist differs from the album
                // artist, so nothing informative is lost.
                <Track key={track.id} track={track} index={index} trackCount={trackResults.length} />
              ))}
            </div>
          )}
          {artistResults.length === 0 && albumResults.length === 0 && trackResults.length === 0 && (
            <p className="jukebox-panel-empty">No results</p>
          )}
        </>
      )}
    </div>
  );
};

export default SearchTab;

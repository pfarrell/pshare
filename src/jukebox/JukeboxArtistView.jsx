import { useState, useEffect } from 'react';
import { apiService } from '../services/api';
import JukeboxAlbumTile from './JukeboxAlbumTile';
import { useQueueActions } from '../hooks/useQueueActions';

// Drill-down from a search-result artist: shows that artist's albums in the
// same panel slot. Tapping an album opens the tracks panel (via onSelectAlbum,
// owned by JukeboxBrowsePanel). "Shuffle artist" plays a random selection of
// the artist's tracks — the same call the shared ArtistCard's play button
// makes — and is available immediately, since it doesn't need the albums.
const JukeboxArtistView = ({ artist, onSelectAlbum, onBack }) => {
  const [data, setData] = useState(null);
  const [error, setError] = useState(false);

  const load = () => {
    setError(false);
    setData(null);
    apiService.getArtist(artist.id)
      .then((response) => setData(response.data))
      .catch(() => setError(true));
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- re-fetch only when the artist actually changes, not on every load() identity change
  }, [artist.id]);

  const shuffle = useQueueActions(
    () => apiService.getRandomScopeTracks('artist', artist.id).then((response) => response.data.tracks),
    { queueSource: { type: 'artist', id: artist.id }, errorLabel: 'Failed to shuffle artist' }
  );

  return (
    <div className="jukebox-drill-view">
      <button type="button" className="jukebox-back-button" onClick={onBack}>‹ Back</button>
      <div className="jukebox-artist-header">
        <h2 className="jukebox-drill-title">{artist.name}</h2>
        <button
          type="button"
          className="jukebox-shuffle-button"
          disabled={shuffle.loading}
          onClick={shuffle.play}
        >
          Shuffle artist
        </button>
      </div>

      {error && (
        <div className="jukebox-panel-error">
          <p>Failed to load albums.</p>
          <button onClick={load}>Retry</button>
        </div>
      )}
      {!error && data === null && <div className="jukebox-panel-loading">Loading…</div>}
      {!error && data !== null && data.albums.length === 0 && (
        <p className="jukebox-panel-empty">No albums found</p>
      )}
      {!error && data !== null && data.albums.length > 0 && (
        <div className="jukebox-album-grid">
          {data.albums.map((album) => (
            <JukeboxAlbumTile
              key={album.id}
              album={{ ...album, artist: album.artist ?? data.artist }}
              imageUrl={apiService.getImageUrl(album.image_path, 'album_small')}
              onSelect={onSelectAlbum}
            />
          ))}
        </div>
      )}
    </div>
  );
};

export default JukeboxArtistView;

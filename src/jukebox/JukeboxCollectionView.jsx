import { useState, useEffect } from 'react';
import { apiService } from '../services/api';
import JukeboxAlbumTile from './JukeboxAlbumTile';
import { useQueueActions } from '../hooks/useQueueActions';

// Drill-down from a search-result collection: shows that collection's albums
// in the same panel slot the artist view uses. Tapping an album opens the
// tracks panel (via onSelectAlbum, owned by JukeboxBrowsePanel). "Shuffle
// All" plays a random selection across the whole collection — the same
// getRandomScopeTracks('collection', id) call the desktop Collection page's
// play button uses — and is available immediately, since it doesn't need the
// albums. Unresolved stubs (placeholder albums with no media) are skipped:
// there's nothing here to browse into or play.
const JukeboxCollectionView = ({ collection, onSelectAlbum, onBack, onEnqueue }) => {
  const [data, setData] = useState(null);
  const [error, setError] = useState(false);

  const load = () => {
    setError(false);
    setData(null);
    apiService.getCollection(collection.id)
      .then((response) => setData(response.data))
      .catch(() => setError(true));
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- re-fetch only when the collection actually changes, not on every load() identity change
  }, [collection.id]);

  const shuffle = useQueueActions(
    () => apiService.getRandomScopeTracks('collection', collection.id).then((response) => response.data.tracks),
    { queueSource: { type: 'collection', id: collection.id }, errorLabel: 'Failed to shuffle collection' }
  );

  const albums = data?.albums ?? [];

  return (
    <div className="jukebox-drill-view">
      <button type="button" className="jukebox-back-button" onClick={onBack}>‹ Back</button>
      <div className="jukebox-artist-header">
        <h2 className="jukebox-drill-title">{collection.name}</h2>
        <button
          type="button"
          className="jukebox-shuffle-button"
          disabled={shuffle.loading}
          onClick={() => { shuffle.play(); onEnqueue?.(); }}
        >
          Shuffle All
        </button>
      </div>

      {error && (
        <div className="jukebox-panel-error">
          <p>Failed to load albums.</p>
          <button onClick={load}>Retry</button>
        </div>
      )}
      {!error && data === null && <div className="jukebox-panel-loading">Loading…</div>}
      {!error && data !== null && albums.length === 0 && (
        <p className="jukebox-panel-empty">No albums found</p>
      )}
      {!error && data !== null && albums.length > 0 && (
        <div className="jukebox-album-grid">
          {albums.map((album) => (
            <JukeboxAlbumTile
              key={album.id}
              album={album}
              imageUrl={apiService.getImageUrl(album.image_path, 'album_small')}
              onSelect={onSelectAlbum}
            />
          ))}
        </div>
      )}
    </div>
  );
};

export default JukeboxCollectionView;

import { useState, useEffect } from 'react';
import { apiService } from '../services/api';
import JukeboxAlbumTile from './JukeboxAlbumTile';

// A plain vertical grid of tiles: tapping one drills into that album's track
// list via onSelectAlbum (owned by JukeboxBrowsePanel, same as Search's album
// tap). There is deliberately no scroller here — the browse panel itself
// scrolls vertically (see useTouchScroll in JukeboxBrowsePanel), which avoids
// the nested horizontal-inside-vertical scroll conflict the old row had.
const QuickHitTab = ({ onSelectAlbum }) => {
  const [albums, setAlbums] = useState(null);
  const [error, setError] = useState(false);

  const load = () => {
    setError(false);
    setAlbums(null);
    apiService.getRecentAlbums(20)
      .then((response) => setAlbums(response.data))
      .catch(() => setError(true));
  };

  useEffect(() => {
    load();
  }, []);

  if (error) {
    return (
      <div className="jukebox-panel-error">
        <p>Failed to load albums.</p>
        <button onClick={load}>Retry</button>
      </div>
    );
  }

  if (albums === null) {
    return <div className="jukebox-panel-loading">Loading…</div>;
  }

  if (albums.length === 0) {
    return <p className="jukebox-panel-empty">Nothing played yet — try Search instead</p>;
  }

  return (
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
  );
};

export default QuickHitTab;

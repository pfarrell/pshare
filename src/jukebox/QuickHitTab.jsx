import { useState, useEffect, useRef } from 'react';
import { apiService } from '../services/api';
import AlbumCard from '../components/AlbumCard';
import { useTouchScroll } from './useTouchScroll';

// AlbumCard already has its own tap-to-play PlayButton (see
// src/components/AlbumCard.jsx) wired through useQueueActions, so this
// component only needs to fetch and lay the albums out — no new play logic.
const QuickHitTab = () => {
  const [albums, setAlbums] = useState(null);
  const [error, setError] = useState(false);
  const rowRef = useRef(null);
  useTouchScroll(rowRef, { axis: 'x' });

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
    <div className="jukebox-quick-hit-row" ref={rowRef}>
      {albums.map((album) => (
        <AlbumCard
          key={album.id}
          album={album}
          artist={album.artist}
          imageUrl={apiService.getImageUrl(album.image_path, 'album_small')}
          onClick={() => {}}
        />
      ))}
    </div>
  );
};

export default QuickHitTab;

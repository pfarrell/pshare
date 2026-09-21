import { useState, useEffect } from 'react';
import { apiService } from '../services/api';
import AlbumCard from '../components/AlbumCard';

// Drill-down from a search result artist: shows that artist's albums in the
// same panel slot. AlbumCard already has its own tap-to-play PlayButton, so
// tapping an album here doesn't need new play logic — only its card-body
// onClick (drill further into the album's track list) is new.
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

  return (
    <div className="jukebox-drill-view">
      <button type="button" className="jukebox-back-button" onClick={onBack}>‹ Back</button>
      <h2 className="jukebox-drill-title">{artist.name}</h2>

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
        <div className="jukebox-search-albums">
          {data.albums.map((album) => (
            <AlbumCard
              key={album.id}
              album={album}
              artist={data.artist}
              imageUrl={apiService.getImageUrl(album.image_path, 'album_small')}
              onClick={() => onSelectAlbum(album)}
            />
          ))}
        </div>
      )}
    </div>
  );
};

export default JukeboxArtistView;

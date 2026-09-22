import { useState } from 'react';

// Jukebox-only playlist tile for Search results. Reuses AlbumTile's CSS
// classes (jukebox-album-tile*) since the layout is identical — cover-or-
// placeholder, title, one line of meta — just with a track count instead of
// an artist name. Deliberately not AlbumCard/PlaylistCard-style: no play
// button or menu, just "tap to open this playlist's tracks".
const JukeboxPlaylistTile = ({ playlist, imageUrl, onSelect }) => {
  const [imageFailed, setImageFailed] = useState(false);
  const trackCount = playlist.track_count ?? 0;

  return (
    <button type="button" className="jukebox-album-tile" onClick={() => onSelect(playlist)}>
      {imageUrl && !imageFailed ? (
        <img
          className="jukebox-album-tile-art"
          src={imageUrl}
          alt=""
          draggable={false}
          onError={() => setImageFailed(true)}
        />
      ) : (
        <div className="jukebox-album-tile-art-placeholder" aria-hidden="true">♪</div>
      )}
      <span className="jukebox-album-tile-title">{playlist.name}</span>
      <span className="jukebox-album-tile-artist">{trackCount} {trackCount === 1 ? 'track' : 'tracks'}</span>
    </button>
  );
};

export default JukeboxPlaylistTile;

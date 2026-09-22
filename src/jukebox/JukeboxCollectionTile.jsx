import { useState } from 'react';

// Jukebox-only collection tile for Search results. Reuses AlbumTile's CSS
// classes (jukebox-album-tile*) since the layout is identical — cover-or-
// placeholder, title, one line of meta — just with an album count instead of
// an artist name.
const JukeboxCollectionTile = ({ collection, imageUrl, onSelect }) => {
  const [imageFailed, setImageFailed] = useState(false);
  const albumCount = collection.album_count ?? 0;

  return (
    <button type="button" className="jukebox-album-tile" onClick={() => onSelect(collection)}>
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
      <span className="jukebox-album-tile-title">{collection.name}</span>
      <span className="jukebox-album-tile-artist">{albumCount} {albumCount === 1 ? 'album' : 'albums'}</span>
    </button>
  );
};

export default JukeboxCollectionTile;

import { useState } from 'react';

// Jukebox-only album tile, shared by Quick Hit, Search and the artist view.
// Deliberately not AlbumCard: that component is shared with the normal site and
// carries a play button, ⋯ menu and favorite/collection actions, none of which
// belong on a kiosk tile whose one job is "tap to open this album's tracks".
const JukeboxAlbumTile = ({ album, imageUrl, onSelect }) => {
  const [imageFailed, setImageFailed] = useState(false);

  return (
    <button type="button" className="jukebox-album-tile" onClick={() => onSelect(album)}>
      {imageUrl && !imageFailed ? (
        // alt="" on purpose: the title/artist text below already names the
        // album, and a broken image would otherwise render alt text over the art.
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
      <span className="jukebox-album-tile-title">{album.title}</span>
      <span className="jukebox-album-tile-artist">{album.artist?.name ?? ''}</span>
    </button>
  );
};

export default JukeboxAlbumTile;

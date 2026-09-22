import { useState } from 'react';

// Jukebox-only artist tile for Search results — a circular photo, name and
// album count that opens the artist view on tap. Deliberately not ArtistCard,
// which is shared with the normal site and carries a play button and menu.
const JukeboxArtistTile = ({ artist, imageUrl, onSelect }) => {
  const [imageFailed, setImageFailed] = useState(false);
  // The search API returns album_count as a string, so coerce before comparing.
  const count = Number(artist.album_count);
  const albumCount = count > 0 ? `${count} ${count === 1 ? 'album' : 'albums'}` : '';

  return (
    <button type="button" className="jukebox-artist-tile" onClick={() => onSelect(artist)}>
      {imageUrl && !imageFailed ? (
        <img
          className="jukebox-artist-tile-art"
          src={imageUrl}
          alt=""
          draggable={false}
          onError={() => setImageFailed(true)}
        />
      ) : (
        <div className="jukebox-artist-tile-art-placeholder" aria-hidden="true">
          {artist.name?.trim()?.[0]?.toUpperCase() ?? '?'}
        </div>
      )}
      <span className="jukebox-artist-tile-name">{artist.name}</span>
      {albumCount && <span className="jukebox-artist-tile-meta">{albumCount}</span>}
    </button>
  );
};

export default JukeboxArtistTile;

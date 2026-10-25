// src/components/SpotifyAlbumCard.jsx
import { useNavigate } from 'react-router-dom';
import EntityCard from './EntityCard';
import PlayButton from './PlayButton';
import { SpotifyLogo } from './OpenInSpotify';
import { useQueueActions } from '../hooks/useQueueActions';
import { albumQueueTracks } from '../player/spotify/albumQueue';

const FALLBACK_COVER = `${import.meta.env.BASE_URL}icons/icon-192.png`;

// A Spotify album in the artist page grid (#72): same EntityCard shell as
// AlbumCard, plus a small Spotify logo in the cover corner. No context menu,
// favorite or collection actions — those need a library album id. Spotify
// adds pass no queueSource, so end-of-queue continuation never fires.
const SpotifyAlbumCard = ({ album, localArtistId }) => {
  const navigate = useNavigate();
  const queue = useQueueActions(albumQueueTracks(album), { errorLabel: 'Failed to play Spotify album' });
  const title = typeof album?.name === 'string' ? album.name : '';
  const year = typeof album?.releaseYear === 'string' ? album.releaseYear : '';
  const imageUrl = typeof album?.imageUrl === 'string' && album.imageUrl ? album.imageUrl : FALLBACK_COVER;

  return (
    <EntityCard
      title={title}
      imageUrl={imageUrl}
      imageAlt={title}
      cardImageStyle={{ cursor: 'pointer' }}
      imageBadge={<SpotifyLogo className="spotify-album-marker" />}
      listSubtitle={['Album', year, 'Spotify'].filter(Boolean).join(' · ')}
      onClick={() => navigate(`/spotify/album/${album.id}`, { state: { localArtistId, year } })}
      play={{
        loading: queue.loading,
        onPlay: queue.play,
        onPlayNext: queue.playNext,
        onAddToQueue: queue.addToQueue,
        label: `Play ${title}`,
      }}
      cardFooter={(
        <div className="album-card-meta-row">
          {year && <span className="album-card-meta">{year}</span>}
          <PlayButton
            size={22}
            data-result-row-play="true"
            onClick={(e) => { e.stopPropagation(); queue.play(); }}
            loading={queue.loading}
            aria-label={`Play ${title}`}
          />
        </div>
      )}
    />
  );
};

export default SpotifyAlbumCard;

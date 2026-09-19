import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import AddToCollectionModal from './AddToCollectionModal';
import EntityCard from './EntityCard';
import PlayButton from './PlayButton';
import { useIsCurrentPage } from '../hooks/useIsCurrentPage';
import { useFavoriteToggle } from '../hooks/useFavoriteToggle';
import { useQueueActions } from '../hooks/useQueueActions';
import { apiService } from '../services/api';
import { useAuthStore } from '../stores/authStore';
import { formatCount, getAlbumYear } from '../utils/formatters';

const AlbumCard = ({ album, artist, onClick, imageUrl, hideArtist = false }) => {
  const [showCollectionModal, setShowCollectionModal] = useState(false);
  const navigate = useNavigate();
  const { isAuthenticated } = useAuthStore();
  const favorite = useFavoriteToggle('album', album, { track_count: album.track_count, artist });
  const onThisArtist = useIsCurrentPage(artist?.id ? `/artist/${artist.id}` : null);
  const showGoToArtist = Boolean(artist?.id && !onThisArtist);

  const queue = useQueueActions(
    () => apiService.getAlbum(album.id).then((response) => response.data.tracks),
    { queueSource: { type: 'album', id: album.id }, errorLabel: 'Failed to play album' }
  );

  const trackCount = formatCount(album.track_count || null, 'track');
  const trackCountSuffix = trackCount ? ` (${trackCount})` : '';
  const yearText = getAlbumYear(album.release_year);
  const yearSuffix = yearText ? ` · ${yearText}` : '';
  const metaText = [yearText, trackCount].filter(Boolean).join(' · ');
  const subtitle = hideArtist
    ? `Album${yearSuffix}${trackCountSuffix}`
    : `Album · ${artist?.name || ''}${album.has_collaborators ? ' +' : ''}${yearSuffix}${trackCountSuffix}`;

  return (
    <>
      <EntityCard
        title={album.title}
        imageUrl={imageUrl}
        imageAlt={`${album.title}, ${artist?.name || ''}`}
        cardImageStyle={{ cursor: 'pointer' }}
        listSubtitle={subtitle}
        onClick={() => onClick(album)}
        play={{
          loading: queue.loading,
          onPlay: queue.play,
          onPlayNext: queue.playNext,
          onAddToQueue: queue.addToQueue,
          label: `Play ${album.title}`,
        }}
        cardFooter={(
          <>
            {!hideArtist && (
              <p style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)', margin: '0.25rem 0 0 0', cursor: 'pointer' }}>
                {artist?.name}{album.has_collaborators && ' +'}
              </p>
            )}
            <div className="album-card-meta-row">
              {metaText && <span className="album-card-meta">{metaText}</span>}
              <PlayButton
                size={22}
                data-result-row-play="true"
                onClick={(e) => { e.stopPropagation(); queue.play(); }}
                loading={queue.loading}
                aria-label={`Play ${album.title}`}
              />
            </div>
          </>
        )}
        actions={[
          { key: 'play-next', icon: '⏭', label: 'Play Next', onClick: queue.playNext },
          { key: 'add-queue', icon: '➕', label: 'Add to Queue', onClick: queue.addToQueue },
          showGoToArtist && { key: 'artist', icon: '🎤', label: 'Go to Artist', onClick: () => navigate(`/artist/${artist.id}`) },
          isAuthenticated && { key: 'collection', icon: '▣', label: 'Add to Collection', onClick: () => setShowCollectionModal(true) },
          isAuthenticated && { key: 'favorite', icon: favorite.icon, label: favorite.label, onClick: favorite.toggle },
        ]}
        shouldIgnore={() => !isAuthenticated && !showGoToArtist}
        menuTestId="album-card-menu-backdrop"
      />

      {showCollectionModal && (
        <AddToCollectionModal
          album={album}
          onClose={() => setShowCollectionModal(false)}
        />
      )}
    </>
  );
};

export default AlbumCard;

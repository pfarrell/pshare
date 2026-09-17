import { useState } from 'react';
import AddToCollectionModal from './AddToCollectionModal';
import { useNavigate } from 'react-router-dom';
import ResultRow from './ResultRow';
import PlayButton from './PlayButton';
import ContextMenu from './ContextMenu';
import { useContextMenu } from '../hooks/useContextMenu';
import { useIsMobile } from '../hooks/useIsMobile';
import { useIsCurrentPage } from '../hooks/useIsCurrentPage';
import { useQueueActions } from '../hooks/useQueueActions';
import { useViewModeStore } from '../stores/viewModeStore';
import { apiService } from '../services/api';
import { usePlayerStore } from '../stores/playerStore';
import { useAuthStore } from '../stores/authStore';
import { useFavoriteToggle } from '../hooks/useFavoriteToggle';
import { formatCount, getAlbumYear } from '../utils/formatters';
import { handleSmallImageError } from '../utils/imageFallback';

const AlbumCard = ({ album, artist, onClick, imageUrl, hideArtist = false, collectionId = null }) => {
  const [showCollectionModal, setShowCollectionModal] = useState(false);
  const isMobile = useIsMobile();
  const viewMode = useViewModeStore((s) => s.mode);
  const navigate = useNavigate();
  const setCollectionContext = usePlayerStore((s) => s.setCollectionContext);
  const { isAuthenticated } = useAuthStore();
  const favorite = useFavoriteToggle('album', album, { track_count: album.track_count, artist });
  const onThisArtist = useIsCurrentPage(artist?.id ? `/artist/${artist.id}` : null);
  const showGoToArtist = artist?.id && !onThisArtist;
  const ctxMenu = useContextMenu({
    shouldIgnore: (e) => e.target.closest('[data-result-row-play]') || (!isAuthenticated && !showGoToArtist),
  });

  // Mirrors Album.jsx's tagCollectionContext(): when this card is played from
  // a collection's grid, tag the queue so usePlayerEngine can auto-advance
  // into the collection's next album once playback naturally runs out.
  const tagCollectionContext = () => {
    if (collectionId) {
      setCollectionContext({ collectionId, albumId: album.id });
    }
  };

  const queue = useQueueActions(
    () => apiService.getAlbum(album.id).then((response) => response.data.tracks),
    { afterEnqueue: tagCollectionContext, errorLabel: 'Failed to play album' }
  );

  const trackCount = formatCount(album.track_count || null, 'track');
  const trackCountSuffix = trackCount ? ` (${trackCount})` : '';
  const yearText = getAlbumYear(album.release_year);
  const yearSuffix = yearText ? ` · ${yearText}` : '';
  const metaText = [yearText, trackCount].filter(Boolean).join(' · ');
  const subtitle = hideArtist
    ? `Album${yearSuffix}${trackCountSuffix}`
    : `Album · ${artist?.name || ''}${album.has_collaborators ? ' +' : ''}${yearSuffix}${trackCountSuffix}`;

  const menuActions = [
    { key: 'play-next', icon: '⏭', label: 'Play Next', onClick: queue.playNext },
    { key: 'add-queue', icon: '➕', label: 'Add to Queue', onClick: queue.addToQueue },
    showGoToArtist && { key: 'artist', icon: '🎤', label: 'Go to Artist', onClick: () => navigate(`/artist/${artist.id}`) },
    isAuthenticated && { key: 'collection', icon: '▣', label: 'Add to Collection', onClick: () => setShowCollectionModal(true) },
    isAuthenticated && {
      key: 'favorite',
      icon: favorite.icon,
      label: favorite.label,
      onClick: favorite.toggle,
    },
  ];

  return (
    <>
      {(isMobile || viewMode === 'list') ? (
        <ResultRow
          imageUrl={imageUrl}
          imageShape="square"
          title={album.title}
          subtitle={subtitle}
          onClick={() => !ctxMenu.open && onClick(album)}
          onImageError={handleSmallImageError}
          onContextMenu={ctxMenu.triggerProps.onContextMenu}
          onTouchStart={ctxMenu.triggerProps.onTouchStart}
          onTouchMove={ctxMenu.triggerProps.onTouchMove}
          onTouchEnd={ctxMenu.triggerProps.onTouchEnd}
          play={{
            loading: queue.loading,
            onPlay: queue.playAll,
            onPlayNow: queue.playNow,
            onPlayNext: queue.playNext,
            onAddToQueue: queue.addToQueue,
            label: `Play ${album.title}`,
          }}
        />
      ) : (
        <div
          className="artist-card"
          onClick={() => !ctxMenu.open && onClick(album)}
          {...ctxMenu.triggerProps}
        >
          <div className="artist-card-image">
            <img
              src={imageUrl}
              alt={`${album.title}, ${artist?.name || ''}`}
              style={{ cursor: 'pointer' }}
              onError={handleSmallImageError}
            />
          </div>
          <div className="artist-card-title">
            <h3>{album.title}</h3>
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
                onClick={(e) => { e.stopPropagation(); queue.playAll(); }}
                loading={queue.loading}
                aria-label={`Play ${album.title}`}
              />
            </div>
          </div>
        </div>
      )}

      <ContextMenu
        open={ctxMenu.open}
        position={ctxMenu.position}
        openedViaTouch={ctxMenu.openedViaTouch}
        onDismiss={ctxMenu.dismiss}
        onSwallowTouch={ctxMenu.swallowTouch}
        onClose={ctxMenu.close}
        actions={menuActions}
        testId="album-card-menu-backdrop"
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

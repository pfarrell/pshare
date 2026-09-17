import { useState } from 'react';
import AddToCollectionModal from './AddToCollectionModal';
import { useNavigate } from 'react-router-dom';
import ResultRow from './ResultRow';
import PlayButton from './PlayButton';
import ContextMenu from './ContextMenu';
import { useContextMenu } from '../hooks/useContextMenu';
import { useIsMobile } from '../hooks/useIsMobile';
import { useIsCurrentPage } from '../hooks/useIsCurrentPage';
import { useViewModeStore } from '../stores/viewModeStore';
import { apiService } from '../services/api';
import { usePlayerStore } from '../stores/playerStore';
import { useAuthStore } from '../stores/authStore';
import { useFavoritesStore } from '../stores/favoritesStore';
import { formatCount, getAlbumYear } from '../utils/formatters';
import { handleSmallImageError } from '../utils/imageFallback';

const AlbumCard = ({ album, artist, onClick, imageUrl, hideArtist = false, collectionId = null }) => {
  const [showCollectionModal, setShowCollectionModal] = useState(false);
  const [playLoading, setPlayLoading] = useState(false);
  const isMobile = useIsMobile();
  const viewMode = useViewModeStore((s) => s.mode);
  const navigate = useNavigate();
  const addTracks = usePlayerStore((s) => s.addTracks);
  const setPlaylist = usePlayerStore((s) => s.setPlaylist);
  const setCollectionContext = usePlayerStore((s) => s.setCollectionContext);
  const { isAuthenticated } = useAuthStore();
  const isFavorite = useFavoritesStore((s) => s.isFavorite('album', album.id));
  const toggleFavorite = useFavoritesStore((s) => s.toggleFavorite);
  const onThisArtist = useIsCurrentPage(artist?.id ? `/artist/${artist.id}` : null);
  const showGoToArtist = artist?.id && !onThisArtist;
  const ctxMenu = useContextMenu({
    shouldIgnore: (e) => e.target.closest('[data-result-row-play]') || (!isAuthenticated && !showGoToArtist),
  });

  const withAlbumTracks = async (dispatch) => {
    setPlayLoading(true);
    try {
      const response = await apiService.getAlbum(album.id);
      dispatch(response.data.tracks);
    } catch (err) {
      console.error('Failed to play album', err);
    } finally {
      setPlayLoading(false);
    }
  };

  // Mirrors Album.jsx's tagCollectionContext(): when this card is played from
  // a collection's grid, tag the queue so usePlayerEngine can auto-advance
  // into the collection's next album once playback naturally runs out.
  const tagCollectionContext = () => {
    if (collectionId) {
      setCollectionContext({ collectionId, albumId: album.id });
    }
  };

  const handlePlayAll = () => withAlbumTracks((tracks) => {
    addTracks(tracks, false, { flashActivity: true }); // store auto-starts playback if idle
    tagCollectionContext();
  });

  const handlePlayNow = () => withAlbumTracks((tracks) => {
    setPlaylist(tracks);
    tagCollectionContext();
  });

  const handlePlayNext = () => withAlbumTracks((tracks) => {
    addTracks(tracks, true, { flashActivity: true });
    tagCollectionContext();
  });

  const handleAddToQueue = () => withAlbumTracks((tracks) => {
    addTracks(tracks, false, { flashActivity: true });
    tagCollectionContext();
  });

  const handleToggleFavorite = () => {
    toggleFavorite('album', album.id, {
      id: album.id,
      title: album.title,
      image_path: album.image_path,
      track_count: album.track_count,
      artist: artist ? { id: artist.id, name: artist.name } : null,
    });
  };

  const trackCount = formatCount(album.track_count || null, 'track');
  const trackCountSuffix = trackCount ? ` (${trackCount})` : '';
  const yearText = getAlbumYear(album.release_year);
  const yearSuffix = yearText ? ` · ${yearText}` : '';
  const metaText = [yearText, trackCount].filter(Boolean).join(' · ');
  const subtitle = hideArtist
    ? `Album${yearSuffix}${trackCountSuffix}`
    : `Album · ${artist?.name || ''}${album.has_collaborators ? ' +' : ''}${yearSuffix}${trackCountSuffix}`;

  const menuActions = [
    { key: 'play-next', icon: '⏭', label: 'Play Next', onClick: handlePlayNext },
    { key: 'add-queue', icon: '➕', label: 'Add to Queue', onClick: handleAddToQueue },
    showGoToArtist && { key: 'artist', icon: '🎤', label: 'Go to Artist', onClick: () => navigate(`/artist/${artist.id}`) },
    isAuthenticated && { key: 'collection', icon: '▣', label: 'Add to Collection', onClick: () => setShowCollectionModal(true) },
    isAuthenticated && {
      key: 'favorite',
      icon: isFavorite ? '★' : '☆',
      label: isFavorite ? 'Remove from Favorites' : 'Add to Favorites',
      onClick: handleToggleFavorite,
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
            loading: playLoading,
            onPlay: handlePlayAll,
            onPlayNow: handlePlayNow,
            onPlayNext: handlePlayNext,
            onAddToQueue: handleAddToQueue,
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
                onClick={(e) => { e.stopPropagation(); handlePlayAll(); }}
                loading={playLoading}
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

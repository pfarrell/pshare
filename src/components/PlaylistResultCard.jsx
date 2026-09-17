// src/components/PlaylistResultCard.jsx
import { useState } from 'react';
import { formatCount } from '../utils/formatters';
import { apiService } from '../services/api';
import { usePlayerStore } from '../stores/playerStore';
import { useAuthStore } from '../stores/authStore';
import { useFavoriteToggle } from '../hooks/useFavoriteToggle';
import ResultRow from './ResultRow';
import ContextMenu from './ContextMenu';
import CoverCollage from './CoverCollage';
import { useContextMenu } from '../hooks/useContextMenu';
import { useQueueActions } from '../hooks/useQueueActions';
import { useIsMobile } from '../hooks/useIsMobile';
import { useViewModeStore } from '../stores/viewModeStore';
import { handleSmallImageError } from '../utils/imageFallback';

// previewAlbums is only passed by the Playlists list page (its API response
// is the only one that includes it) — that's what scopes the collage to that
// page without affecting Search results or Library/Favorites, which render
// this same card with a plain imageUrl.
const PlaylistResultCard = ({ playlist, onClick, imageUrl, previewAlbums }) => {
  const isMobile = useIsMobile();
  const viewMode = useViewModeStore((s) => s.mode);
  const { isAuthenticated } = useAuthStore();
  const favorite = useFavoriteToggle('playlist', playlist);
  const ctxMenu = useContextMenu({
    shouldIgnore: (e) => !isAuthenticated || e.target.closest('[data-result-row-play]'),
  });

  const queue = useQueueActions(
    () => apiService.getPlaylist(playlist.id).then((response) => response.data.tracks.map((track) => ({
      ...track,
      source_playlist: { id: playlist.id, name: playlist.name },
    }))),
    { errorLabel: 'Failed to play playlist' }
  );

  const menu = (
    <ContextMenu
      open={ctxMenu.open}
      position={ctxMenu.position}
      onDismiss={ctxMenu.dismiss}
      onSwallowTouch={ctxMenu.swallowTouch}
      onClose={ctxMenu.close}
      actions={[{
        key: 'favorite',
        icon: favorite.icon,
        label: favorite.label,
        onClick: favorite.toggle,
      }]}
      testId="playlist-card-menu-backdrop"
    />
  );

  if (isMobile || viewMode === 'list') {
    const trackCount = formatCount(playlist.track_count || null, 'track');
    const imageContent = (!playlist.image_path && previewAlbums?.length)
      ? <CoverCollage items={previewAlbums} alt={playlist.name} placeholderGlyph="♪" />
      : undefined;
    return (
      <>
        <ResultRow
          imageUrl={imageUrl}
          imageContent={imageContent}
          imageShape="square"
          title={playlist.name}
          subtitle={trackCount ? `Playlist · ${trackCount}` : 'Playlist'}
          onClick={() => !ctxMenu.open && onClick(playlist)}
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
            label: `Play ${playlist.name}`,
          }}
        />
        {menu}
      </>
    );
  }

  return (
    <>
      <div className="artist-card" onClick={() => !ctxMenu.open && onClick(playlist)} {...ctxMenu.triggerProps}>
        <div className="artist-card-image">
          <img
            src={imageUrl}
            alt={playlist.name}
            onError={handleSmallImageError}
          />
        </div>
        <div className="artist-card-title">
          <h3>{playlist.name}</h3>
          {formatCount(playlist.track_count || null, 'track') && (
            <p style={{ fontSize: '0.7rem', color: 'var(--color-text-faint)', margin: '0.125rem 0 0 0' }}>
              {formatCount(playlist.track_count || null, 'track')}
            </p>
          )}
        </div>
      </div>
      {menu}
    </>
  );
};

export default PlaylistResultCard;

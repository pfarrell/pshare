// src/components/PlaylistResultCard.jsx
import { useState } from 'react';
import { formatCount } from '../utils/formatters';
import { apiService } from '../services/api';
import { usePlayerStore } from '../stores/playerStore';
import { useAuthStore } from '../stores/authStore';
import { useFavoritesStore } from '../stores/favoritesStore';
import ResultRow from './ResultRow';
import ContextMenu from './ContextMenu';
import CoverCollage from './CoverCollage';
import { useContextMenu } from '../hooks/useContextMenu';
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
  const [playLoading, setPlayLoading] = useState(false);
  const addTracks = usePlayerStore((s) => s.addTracks);
  const setPlaylist = usePlayerStore((s) => s.setPlaylist);
  const { isAuthenticated } = useAuthStore();
  const isFavorite = useFavoritesStore((s) => s.isFavorite('playlist', playlist.id));
  const toggleFavorite = useFavoritesStore((s) => s.toggleFavorite);
  const ctxMenu = useContextMenu({
    shouldIgnore: (e) => !isAuthenticated || e.target.closest('[data-result-row-play]'),
  });

  const withPlaylistTracks = async (dispatch) => {
    setPlayLoading(true);
    try {
      const response = await apiService.getPlaylist(playlist.id);
      const tracks = response.data.tracks.map((track) => ({
        ...track,
        source_playlist: { id: playlist.id, name: playlist.name },
      }));
      dispatch(tracks);
    } catch (err) {
      console.error('Failed to play playlist', err);
    } finally {
      setPlayLoading(false);
    }
  };

  const handlePlayAll = () => withPlaylistTracks((tracks) => {
    addTracks(tracks, false, { flashActivity: true }); // store auto-starts playback if idle
  });

  const handlePlayNow = () => withPlaylistTracks((tracks) => {
    setPlaylist(tracks);
  });

  const handlePlayNext = () => withPlaylistTracks((tracks) => {
    addTracks(tracks, true, { flashActivity: true });
  });

  const handleAddToQueue = () => withPlaylistTracks((tracks) => {
    addTracks(tracks, false, { flashActivity: true });
  });

  const handleToggleFavorite = () => {
    toggleFavorite('playlist', playlist.id, {
      id: playlist.id,
      name: playlist.name,
      image_path: playlist.image_path,
      track_count: playlist.track_count,
    });
  };

  const menu = (
    <ContextMenu
      open={ctxMenu.open}
      position={ctxMenu.position}
      onDismiss={ctxMenu.dismiss}
      onSwallowTouch={ctxMenu.swallowTouch}
      onClose={ctxMenu.close}
      actions={[{
        key: 'favorite',
        icon: isFavorite ? '★' : '☆',
        label: isFavorite ? 'Remove from Favorites' : 'Add to Favorites',
        onClick: handleToggleFavorite,
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
            loading: playLoading,
            onPlay: handlePlayAll,
            onPlayNow: handlePlayNow,
            onPlayNext: handlePlayNext,
            onAddToQueue: handleAddToQueue,
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

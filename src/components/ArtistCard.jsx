// src/components/ArtistCard.jsx
import { formatCount } from '../utils/formatters';
import ResultRow from './ResultRow';
import ContextMenu from './ContextMenu';
import { useContextMenu } from '../hooks/useContextMenu';
import { useIsMobile } from '../hooks/useIsMobile';
import { useAuthStore } from '../stores/authStore';
import { useFavoritesStore } from '../stores/favoritesStore';
import { useViewModeStore } from '../stores/viewModeStore';
import { handleSmallImageError } from '../utils/imageFallback';

const ArtistCard = ({ artist, onClick, imageUrl }) => {
  const isMobile = useIsMobile();
  const viewMode = useViewModeStore((s) => s.mode);
  const { isAuthenticated } = useAuthStore();
  const isFavorite = useFavoritesStore((s) => s.isFavorite('artist', artist.id));
  const toggleFavorite = useFavoritesStore((s) => s.toggleFavorite);
  // Favorite is the only menu item for artists today, so suppress the
  // gesture entirely when logged out rather than opening an empty menu.
  const ctxMenu = useContextMenu({ shouldIgnore: () => !isAuthenticated });

  const handleToggleFavorite = (e) => {
    e.stopPropagation();
    toggleFavorite('artist', artist.id, { id: artist.id, name: artist.name, image_path: artist.image_path });
    ctxMenu.close();
  };

  const menu = (
    <ContextMenu
      open={ctxMenu.open}
      position={ctxMenu.position}
      onDismiss={ctxMenu.dismiss}
      onSwallowTouch={ctxMenu.swallowTouch}
      testId="artist-card-menu-backdrop"
    >
      <button onClick={handleToggleFavorite} onTouchEnd={(e) => { e.preventDefault(); handleToggleFavorite(e); }}>
        {isFavorite ? '★ Remove from Favorites' : '☆ Add to Favorites'}
      </button>
    </ContextMenu>
  );

  if (isMobile || viewMode === 'list') {
    return (
      <>
        <ResultRow
          imageUrl={imageUrl}
          imageShape="circle"
          title={artist.name}
          subtitle="Artist"
          onClick={() => !ctxMenu.open && onClick(artist)}
          onImageError={handleSmallImageError}
          onContextMenu={ctxMenu.triggerProps.onContextMenu}
          onTouchStart={ctxMenu.triggerProps.onTouchStart}
          onTouchMove={ctxMenu.triggerProps.onTouchMove}
          onTouchEnd={ctxMenu.triggerProps.onTouchEnd}
        />
        {menu}
      </>
    );
  }

  return (
    <>
      <div className="artist-card" onClick={() => !ctxMenu.open && onClick(artist)} {...ctxMenu.triggerProps}>
        <div className="artist-card-image">
          <img
            src={imageUrl}
            alt={artist.name}
            onError={handleSmallImageError}
          />
        </div>

        <div className="artist-card-title">
          <h3>{artist.name}</h3>
          {formatCount(artist.album_count || null, 'album') && (
            <p style={{ fontSize: '0.7rem', color: 'var(--color-text-faint)', margin: '0.125rem 0 0 0' }}>
              {formatCount(artist.album_count || null, 'album')}
            </p>
          )}
        </div>
      </div>
      {menu}
    </>
  );
};

export default ArtistCard;

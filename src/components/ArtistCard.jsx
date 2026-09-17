// src/components/ArtistCard.jsx
import { formatCount } from '../utils/formatters';
import ResultRow from './ResultRow';
import ContextMenu from './ContextMenu';
import { useContextMenu } from '../hooks/useContextMenu';
import { useIsMobile } from '../hooks/useIsMobile';
import { useAuthStore } from '../stores/authStore';
import { useViewModeStore } from '../stores/viewModeStore';
import { useFavoriteToggle } from '../hooks/useFavoriteToggle';
import { handleSmallImageError } from '../utils/imageFallback';

const ArtistCard = ({ artist, onClick, imageUrl }) => {
  const isMobile = useIsMobile();
  const viewMode = useViewModeStore((s) => s.mode);
  const { isAuthenticated } = useAuthStore();
  const favorite = useFavoriteToggle('artist', artist);
  // Favorite is the only menu item for artists today, so suppress the
  // gesture entirely when logged out rather than opening an empty menu.
  const ctxMenu = useContextMenu({ shouldIgnore: () => !isAuthenticated });

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
      testId="artist-card-menu-backdrop"
    />
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

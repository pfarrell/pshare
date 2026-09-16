// src/components/CollectionResultCard.jsx
import { formatCount } from '../utils/formatters';
import ResultRow from './ResultRow';
import ContextMenu from './ContextMenu';
import CoverCollage from './CoverCollage';
import { useContextMenu } from '../hooks/useContextMenu';
import { useIsMobile } from '../hooks/useIsMobile';
import { useAuthStore } from '../stores/authStore';
import { useFavoritesStore } from '../stores/favoritesStore';
import { useViewModeStore } from '../stores/viewModeStore';

// previewAlbums is only passed by the Collections list page (its API response
// is the only one that includes it) — that's what scopes the collage to that
// page without affecting Search results or Library/Favorites, which render
// this same card with a plain imageUrl.
const CollectionResultCard = ({ collection, onClick, imageUrl, previewAlbums }) => {
  const isMobile = useIsMobile();
  const viewMode = useViewModeStore((s) => s.mode);
  const { isAuthenticated } = useAuthStore();
  const isFavorite = useFavoritesStore((s) => s.isFavorite('collection', collection.id));
  const toggleFavorite = useFavoritesStore((s) => s.toggleFavorite);
  const ctxMenu = useContextMenu({ shouldIgnore: () => !isAuthenticated });

  const handleImageError = (e) => {
    if (e.target.src.includes('/sm/')) {
      e.target.src = e.target.src.replace('/sm/', '/');
      e.target.onerror = null;
    }
  };

  const handleToggleFavorite = (e) => {
    e.stopPropagation();
    toggleFavorite('collection', collection.id, { id: collection.id, name: collection.name, image_path: collection.image_path, album_count: collection.album_count });
    ctxMenu.close();
  };

  const menu = (
    <ContextMenu
      open={ctxMenu.open}
      position={ctxMenu.position}
      onDismiss={ctxMenu.dismiss}
      onSwallowTouch={ctxMenu.swallowTouch}
      testId="collection-card-menu-backdrop"
    >
      <button onClick={handleToggleFavorite} onTouchEnd={(e) => { e.preventDefault(); handleToggleFavorite(e); }}>
        {isFavorite ? '★ Remove from Favorites' : '☆ Add to Favorites'}
      </button>
    </ContextMenu>
  );

  if (isMobile || viewMode === 'list') {
    const albumCount = formatCount(collection.album_count || null, 'album');
    const imageContent = (!collection.image_path && previewAlbums?.length)
      ? <CoverCollage items={previewAlbums} alt={collection.name} placeholderGlyph="▣" />
      : undefined;
    return (
      <>
        <ResultRow
          imageUrl={imageUrl}
          imageContent={imageContent}
          imageShape="square"
          title={collection.name}
          subtitle={albumCount ? `Collection · ${albumCount}` : 'Collection'}
          onClick={() => !ctxMenu.open && onClick(collection)}
          onImageError={handleImageError}
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
      <div className="artist-card" onClick={() => !ctxMenu.open && onClick(collection)} {...ctxMenu.triggerProps}>
        <div className="artist-card-image">
          <img src={imageUrl} alt={collection.name} onError={handleImageError} />
        </div>
        <div className="artist-card-title">
          <h3 style={{
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            display: '-webkit-box',
            WebkitLineClamp: 2,
            WebkitBoxOrient: 'vertical'
          }}>{collection.name}</h3>
          {formatCount(collection.album_count || null, 'album') && (
            <p style={{ fontSize: '0.7rem', color: 'var(--color-text-faint)', margin: '0.125rem 0 0 0' }}>
              {formatCount(collection.album_count || null, 'album')}
            </p>
          )}
        </div>
      </div>
      {menu}
    </>
  );
};

export default CollectionResultCard;

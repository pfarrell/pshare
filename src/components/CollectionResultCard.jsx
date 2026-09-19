// src/components/CollectionResultCard.jsx
import { formatCount } from '../utils/formatters';
import EntityCard from './EntityCard';
import CoverCollage from './CoverCollage';
import { useAuthStore } from '../stores/authStore';
import { useFavoriteToggle } from '../hooks/useFavoriteToggle';

// previewAlbums is only passed by the Collections list page (its API response
// is the only one that includes it) — that's what scopes the collage to that
// page without affecting Search results or Library/Favorites, which render
// this same card with a plain imageUrl.
const CollectionResultCard = ({ collection, onClick, imageUrl, previewAlbums }) => {
  const { isAuthenticated } = useAuthStore();
  const favorite = useFavoriteToggle('collection', collection);
  const albumCount = formatCount(collection.album_count || null, 'album');

  return (
    <EntityCard
      title={collection.name}
      imageUrl={imageUrl}
      listSubtitle={albumCount ? `Collection · ${albumCount}` : 'Collection'}
      listImageContent={(!collection.image_path && previewAlbums?.length)
        ? <CoverCollage items={previewAlbums} alt={collection.name} placeholderGlyph="▣" />
        : undefined}
      cardTitleStyle={{ overflow: 'hidden', textOverflow: 'ellipsis', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' }}
      cardFooter={albumCount && (
        <p style={{ fontSize: '0.7rem', color: 'var(--color-text-faint)', margin: '0.125rem 0 0 0' }}>{albumCount}</p>
      )}
      onClick={() => onClick(collection)}
      actions={[isAuthenticated && { key: 'favorite', icon: favorite.icon, label: favorite.label, onClick: favorite.toggle }]}
      menuTestId="collection-card-menu-backdrop"
    />
  );
};

export default CollectionResultCard;

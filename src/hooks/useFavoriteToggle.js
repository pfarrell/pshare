import { favoritePayload, useFavoritesStore } from '../stores/favoritesStore';

export const useFavoriteToggle = (kind, entity, extras) => {
  const id = entity?.id;
  const isFavorite = useFavoritesStore((s) => (id == null ? false : s.isFavorite(kind, id)));
  const toggleFavorite = useFavoritesStore((s) => s.toggleFavorite);

  const toggle = () => {
    if (!entity) return;
    toggleFavorite(kind, entity.id, favoritePayload(kind, entity, extras));
  };

  return {
    isFavorite,
    toggle,
    icon: isFavorite ? '★' : '☆',
    label: isFavorite ? 'Remove from Favorites' : 'Add to Favorites',
  };
};

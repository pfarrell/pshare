import { renderHook, act } from '@testing-library/react';
import { useFavoriteToggle } from './useFavoriteToggle';
import { useFavoritesStore } from '../stores/favoritesStore';

describe('useFavoriteToggle', () => {
  test('reflects favorite state with icon and label', () => {
    useFavoritesStore.setState({ isFavorite: (kind, id) => kind === 'artist' && id === 1, toggleFavorite: vi.fn() });
    const { result } = renderHook(() => useFavoriteToggle('artist', { id: 1, name: 'A', image_path: null }));
    expect(result.current).toMatchObject({ isFavorite: true, icon: '★', label: 'Remove from Favorites' });
  });

  test('toggle sends kind, id, and the canonical payload', () => {
    const toggleFavorite = vi.fn();
    useFavoritesStore.setState({ isFavorite: () => false, toggleFavorite });
    const { result } = renderHook(() => useFavoriteToggle('collection', { id: 4, name: 'C', image_path: null }, { album_count: 2 }));
    expect(result.current).toMatchObject({ isFavorite: false, icon: '☆', label: 'Add to Favorites' });
    act(() => result.current.toggle());
    expect(toggleFavorite).toHaveBeenCalledWith('collection', 4, { id: 4, name: 'C', image_path: null, album_count: 2 });
  });

  test('is inert before the entity loads', () => {
    const toggleFavorite = vi.fn();
    useFavoritesStore.setState({ isFavorite: () => true, toggleFavorite });
    const { result } = renderHook(() => useFavoriteToggle('album', null));
    expect(result.current.isFavorite).toBe(false);
    act(() => result.current.toggle());
    expect(toggleFavorite).not.toHaveBeenCalled();
  });
});

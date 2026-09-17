// src/stores/favoritesStore.test.js
import { useFavoritesStore, favoritePayload } from './favoritesStore';
import { apiService } from '../services/api';

vi.mock('../services/api', () => ({
  apiService: {
    getFavorites: vi.fn(),
    addFavorite: vi.fn(),
    removeFavorite: vi.fn(),
  },
}));

beforeEach(() => {
  useFavoritesStore.setState({ items: [], loading: false, loaded: false });
  vi.clearAllMocks();
});

describe('favoritesStore — load', () => {
  test('populates items from the API', async () => {
    apiService.getFavorites.mockResolvedValue({
      data: [{ id: 1, kind: 'artist', target_id: 5, created_at: '2026-07-30', item: { id: 5, name: 'Test Artist' } }],
    });

    await useFavoritesStore.getState().load();

    expect(useFavoritesStore.getState().items).toHaveLength(1);
    expect(useFavoritesStore.getState().loaded).toBe(true);
  });

  test('leaves items empty and marks loaded on failure, without throwing', async () => {
    apiService.getFavorites.mockRejectedValue(new Error('network error'));

    await useFavoritesStore.getState().load();

    expect(useFavoritesStore.getState().items).toEqual([]);
    expect(useFavoritesStore.getState().loaded).toBe(true);
  });
});

describe('favoritesStore — isFavorite', () => {
  test('returns true when a matching kind+target_id row exists', () => {
    useFavoritesStore.setState({ items: [{ id: 1, kind: 'album', target_id: 9, item: {} }] });
    expect(useFavoritesStore.getState().isFavorite('album', 9)).toBe(true);
  });

  test('returns false when no matching row exists', () => {
    useFavoritesStore.setState({ items: [{ id: 1, kind: 'album', target_id: 9, item: {} }] });
    expect(useFavoritesStore.getState().isFavorite('album', 10)).toBe(false);
  });
});

describe('favoritesStore — toggleFavorite', () => {
  test('optimistically adds, then keeps the server row on success', async () => {
    apiService.addFavorite.mockResolvedValue({
      data: { id: 2, kind: 'track', target_id: 3, created_at: '2026-07-30', item: { id: 3, title: 'Song' } },
    });

    await useFavoritesStore.getState().toggleFavorite('track', 3, { id: 3, title: 'Song' });

    expect(apiService.addFavorite).toHaveBeenCalledWith('track', 3);
    expect(useFavoritesStore.getState().isFavorite('track', 3)).toBe(true);
    expect(useFavoritesStore.getState().items[0].id).toBe(2);
  });

  test('rolls back the optimistic add on failure', async () => {
    apiService.addFavorite.mockRejectedValue(new Error('network error'));

    await useFavoritesStore.getState().toggleFavorite('track', 3, { id: 3, title: 'Song' });

    expect(useFavoritesStore.getState().isFavorite('track', 3)).toBe(false);
  });

  test('optimistically removes an existing favorite, then confirms on success', async () => {
    useFavoritesStore.setState({ items: [{ id: 2, kind: 'track', target_id: 3, item: { id: 3, title: 'Song' } }] });
    apiService.removeFavorite.mockResolvedValue({ data: { success: true } });

    await useFavoritesStore.getState().toggleFavorite('track', 3, { id: 3, title: 'Song' });

    expect(apiService.removeFavorite).toHaveBeenCalledWith('track', 3);
    expect(useFavoritesStore.getState().isFavorite('track', 3)).toBe(false);
  });

  test('rolls back the optimistic remove on failure', async () => {
    useFavoritesStore.setState({ items: [{ id: 2, kind: 'track', target_id: 3, item: { id: 3, title: 'Song' } }] });
    apiService.removeFavorite.mockRejectedValue(new Error('network error'));

    await useFavoritesStore.getState().toggleFavorite('track', 3, { id: 3, title: 'Song' });

    expect(useFavoritesStore.getState().isFavorite('track', 3)).toBe(true);
  });
});

describe('favoritesStore — clear', () => {
  test('resets items and loaded', () => {
    useFavoritesStore.setState({ items: [{ id: 1, kind: 'artist', target_id: 5, item: {} }], loaded: true });

    useFavoritesStore.getState().clear();

    expect(useFavoritesStore.getState().items).toEqual([]);
    expect(useFavoritesStore.getState().loaded).toBe(false);
  });
});

describe('favoritePayload', () => {
  test('artist', () => {
    expect(favoritePayload('artist', { id: 1, name: 'A', image_path: 'a.jpg', extra: 'x' }))
      .toEqual({ id: 1, name: 'A', image_path: 'a.jpg' });
  });

  test('album takes track_count/artist from extras and slims artist to id+name', () => {
    expect(favoritePayload('album', { id: 2, title: 'T', image_path: 't.jpg' }, { track_count: 9, artist: { id: 3, name: 'X', image_path: 'x.jpg' } }))
      .toEqual({ id: 2, title: 'T', image_path: 't.jpg', track_count: 9, artist: { id: 3, name: 'X' } });
    expect(favoritePayload('album', { id: 2, title: 'T', image_path: null }, { track_count: 1, artist: null }).artist).toBeNull();
  });

  test('collection / playlist / track', () => {
    expect(favoritePayload('collection', { id: 4, name: 'C', image_path: null }, { album_count: 5 }))
      .toEqual({ id: 4, name: 'C', image_path: null, album_count: 5 });
    expect(favoritePayload('playlist', { id: 5, name: 'P', image_path: null, track_count: 7 }))
      .toEqual({ id: 5, name: 'P', image_path: null, track_count: 7 });
    const artist = { id: 1, name: 'A' };
    const album = { id: 2, title: 'B' };
    expect(favoritePayload('track', { id: 6, title: 'S', track_number: '1', duration: 100, artist, album, download_url: '/d/6', stream_url: '/s' }))
      .toEqual({ id: 6, title: 'S', track_number: '1', duration: 100, artist, album, download_url: '/d/6' });
  });
});

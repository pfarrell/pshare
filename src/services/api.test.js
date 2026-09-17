vi.mock('axios', () => {
  const instance = { get: vi.fn(), post: vi.fn(), put: vi.fn(), patch: vi.fn(), delete: vi.fn(), defaults: {} };
  return { default: { create: vi.fn(() => instance) } };
});

import axios from 'axios';
import { apiService, qs } from './api';

const http = axios.create();

beforeEach(() => vi.clearAllMocks());

describe('qs', () => {
  test('drops null/undefined/empty and encodes like encodeURIComponent', () => {
    expect(qs({})).toBe('');
    expect(qs({ a: null, b: undefined, c: '' })).toBe('');
    expect(qs({ q: 'rock & roll', page: 1 })).toBe('?q=rock%20%26%20roll&page=1');
  });
});

describe('apiService query strings are unchanged', () => {
  test('search', () => {
    apiService.search('a b');
    expect(http.get).toHaveBeenLastCalledWith('/search?q=a%20b');
    apiService.search('a b', 30);
    expect(http.get).toHaveBeenLastCalledWith('/search?q=a%20b&offset=30');
  });

  test('random artists/albums with and without tag', () => {
    apiService.getRandomArtists(60);
    expect(http.get).toHaveBeenLastCalledWith('/artists/random?size=60');
    apiService.getRandomAlbums(30, 'hip hop');
    expect(http.get).toHaveBeenLastCalledWith('/albums/random?size=30&tag=hip%20hop');
  });

  test('errors page with source', () => {
    apiService.getErrors(2, 25, 'upload');
    expect(http.get).toHaveBeenLastCalledWith('/admin/errors?page=2&limit=25&source=upload');
  });
});

describe('factories', () => {
  test('entityImages paths, with legacy aliases', () => {
    apiService.entityImages.album.list(5);
    expect(http.get).toHaveBeenLastCalledWith('/admin/album/5/images');
    apiService.addArtistImage(7, 'https://x/y.jpg', 'y.jpg');
    expect(http.post).toHaveBeenLastCalledWith('/admin/artist/7/images', { image_url: 'https://x/y.jpg', image_name: 'y.jpg', set_primary: false });
    apiService.entityImages.artist.setPrimary(7, 3);
    expect(http.patch).toHaveBeenLastCalledWith('/admin/artist/7/images/3/primary');
    apiService.deleteAlbumImage(5, 9);
    expect(http.delete).toHaveBeenLastCalledWith('/admin/album/5/images/9');
  });

  test('notes paths, with legacy aliases', () => {
    apiService.notes.collection.add(4, 'hi');
    expect(http.post).toHaveBeenLastCalledWith('/collection/4/notes', { content: 'hi' });
    apiService.deleteTrackNote(8, 2);
    expect(http.delete).toHaveBeenLastCalledWith('/track/8/notes/2');
  });

  test('dead methods are gone', () => {
    expect(apiService.downloadArtistImage).toBeUndefined();
    expect(apiService.downloadAlbumImage).toBeUndefined();
    expect(apiService.bulkUpdateTracks).toBeUndefined();
  });
});

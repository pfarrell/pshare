import { renderHook, act } from '@testing-library/react';
import { useEntitySearch, fetchEntitySearch } from './useEntitySearch';
import { apiService } from '../services/api';

vi.mock('../services/api', () => ({ apiService: { search: vi.fn(), searchAdminArtists: vi.fn() } }));

const searchResponse = {
  data: {
    results: [
      { type: 'album', data: { id: 1, title: 'A' } },
      { type: 'artist', data: { id: 2, name: 'B' } },
    ],
    tracks: [{ id: 3, title: 'T' }],
  },
};

beforeEach(() => {
  vi.clearAllMocks();
  apiService.search.mockResolvedValue(searchResponse);
  apiService.searchAdminArtists.mockResolvedValue({ data: [{ id: 9, name: 'Admin' }] });
});

describe('fetchEntitySearch', () => {
  test('unwraps each kind', async () => {
    expect(await fetchEntitySearch('album', 'x')).toEqual([{ id: 1, title: 'A' }]);
    expect(await fetchEntitySearch('artist', 'x')).toEqual([{ id: 2, name: 'B' }]);
    expect(await fetchEntitySearch('track', 'x')).toEqual([{ id: 3, title: 'T' }]);
    expect(await fetchEntitySearch('artist-admin', 'x')).toEqual([{ id: 9, name: 'Admin' }]);
  });
});

describe('useEntitySearch', () => {
  test('respects minLength and applies filterResults', async () => {
    const { result } = renderHook(() => useEntitySearch('artist-admin', { filterResults: (rows) => rows.filter((r) => r.id !== 9) }));
    act(() => result.current.setQuery('a'));
    await act(async () => { await result.current.search(); });
    expect(apiService.searchAdminArtists).not.toHaveBeenCalled();

    act(() => result.current.setQuery('ad'));
    await act(async () => { await result.current.search(); });
    expect(result.current.results).toEqual([]);
    expect(result.current.hasSearched).toBe(true);
  });

  test('reset and clearResults', async () => {
    const { result } = renderHook(() => useEntitySearch('album', { minLength: 1 }));
    act(() => result.current.setQuery('x'));
    await act(async () => { await result.current.search(); });
    act(() => result.current.clearResults());
    expect(result.current).toMatchObject({ query: 'x', results: [], hasSearched: false });
    act(() => result.current.reset());
    expect(result.current.query).toBe('');
  });
});

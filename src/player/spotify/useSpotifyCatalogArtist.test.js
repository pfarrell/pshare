import { describe, test, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';

const playability = { value: 'ready' };
vi.mock('./useCanPlaySpotify', () => ({ useSpotifyPlayability: () => playability.value }));
vi.mock('../../services/api', () => ({ apiService: { getSpotifyCatalogArtistAlbums: vi.fn() } }));

import { apiService } from '../../services/api';
import { useSpotifyCatalogArtist } from './useSpotifyCatalogArtist';

const body = { configured: true, spotifyArtist: { id: 'sza1', name: 'SZA' }, albums: [{ id: 'sos', name: 'SOS', localId: null }, { name: 'no id' }] };

beforeEach(() => {
  playability.value = 'ready';
  apiService.getSpotifyCatalogArtistAlbums.mockReset();
});

describe('useSpotifyCatalogArtist', () => {
  test('ready with the artist and its albums (id-less ones dropped)', async () => {
    apiService.getSpotifyCatalogArtistAlbums.mockResolvedValue({ data: body });
    const { result } = renderHook(() => useSpotifyCatalogArtist('sza1'));
    expect(result.current.status).toBe('loading');
    await waitFor(() => expect(result.current.status).toBe('ready'));
    expect(result.current.artist.name).toBe('SZA');
    expect(result.current.albums.map((a) => a.id)).toEqual(['sos']);
    expect(apiService.getSpotifyCatalogArtistAlbums).toHaveBeenCalledWith('sza1', { details: false });
  });

  test('details: true asks for the summary and returns it', async () => {
    apiService.getSpotifyCatalogArtistAlbums.mockResolvedValue({ data: { ...body, summary: { summary: 'SZA is a singer.' } } });
    const { result } = renderHook(() => useSpotifyCatalogArtist('sza1', { details: true }));
    await waitFor(() => expect(result.current.status).toBe('ready'));
    expect(result.current.summary.summary).toBe('SZA is a singer.');
    expect(apiService.getSpotifyCatalogArtistAlbums).toHaveBeenCalledWith('sza1', { details: true });
  });

  test('unavailable without a request when the session cannot play Spotify or the id is bad', async () => {
    playability.value = 'unavailable';
    expect(renderHook(() => useSpotifyCatalogArtist('sza1')).result.current.status).toBe('unavailable');
    playability.value = 'ready';
    expect(renderHook(() => useSpotifyCatalogArtist('a/b')).result.current.status).toBe('unavailable');
    expect(apiService.getSpotifyCatalogArtistAlbums).not.toHaveBeenCalled();
  });

  test('unavailable on a failure or an unconfigured backend', async () => {
    apiService.getSpotifyCatalogArtistAlbums.mockRejectedValueOnce(new Error('502'));
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const a = renderHook(() => useSpotifyCatalogArtist('sza1'));
    await waitFor(() => expect(a.result.current.status).toBe('unavailable'));
    warn.mockRestore();
    apiService.getSpotifyCatalogArtistAlbums.mockResolvedValueOnce({ data: { configured: false } });
    const b = renderHook(() => useSpotifyCatalogArtist('sza2'));
    await waitFor(() => expect(b.result.current.status).toBe('unavailable'));
  });

  test('a stale response for a previous id is dropped', async () => {
    let resolveFirst;
    apiService.getSpotifyCatalogArtistAlbums.mockImplementation((id) => (id === 'one'
      ? new Promise((r) => { resolveFirst = r; })
      : Promise.resolve({ data: { ...body, spotifyArtist: { id: 'two', name: 'Two' } } })));
    const { result, rerender } = renderHook(({ id }) => useSpotifyCatalogArtist(id), { initialProps: { id: 'one' } });
    rerender({ id: 'two' });
    await waitFor(() => expect(result.current.artist?.name).toBe('Two'));
    resolveFirst({ data: { ...body, spotifyArtist: { id: 'one', name: 'One' } } });
    await new Promise((r) => setTimeout(r, 0));
    expect(result.current.artist.name).toBe('Two');
  });
});

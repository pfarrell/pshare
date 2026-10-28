import { describe, test, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';

const canPlay = { value: true };
vi.mock('./useCanPlaySpotify', () => ({ useCanPlaySpotify: () => canPlay.value }));
vi.mock('../../services/api', () => ({ apiService: { getSpotifyArtistAlbums: vi.fn() } }));

import { apiService } from '../../services/api';
import { useSpotifyArtistAlbums, useSpotifyArtistCatalog } from './useSpotifyArtistAlbums';

beforeEach(() => {
  canPlay.value = true;
  apiService.getSpotifyArtistAlbums.mockReset();
});

describe('useSpotifyArtistAlbums', () => {
  test('makes no request when the session cannot play Spotify', async () => {
    canPlay.value = false;
    const { result } = renderHook(() => useSpotifyArtistAlbums(5));
    await new Promise((r) => setTimeout(r, 0));
    expect(apiService.getSpotifyArtistAlbums).not.toHaveBeenCalled();
    expect(result.current).toEqual([]);
  });

  test('returns albums when eligible', async () => {
    apiService.getSpotifyArtistAlbums.mockResolvedValue({ data: { configured: true, albums: [{ id: 'a', name: 'Lover' }] } });
    const { result } = renderHook(() => useSpotifyArtistAlbums(5));
    await waitFor(() => expect(result.current).toEqual([{ id: 'a', name: 'Lover' }]));
    expect(apiService.getSpotifyArtistAlbums).toHaveBeenCalledWith(5);
  });

  test("drops a stale response after the artist changes", async () => {
    let resolveA;
    apiService.getSpotifyArtistAlbums.mockImplementation((id) =>
      id === 1
        ? new Promise((r) => { resolveA = r; })
        : Promise.resolve({ data: { configured: true, albums: [{ id: 'b', name: 'B album' }] } }));
    const { result, rerender } = renderHook(({ id }) => useSpotifyArtistAlbums(id), { initialProps: { id: 1 } });
    rerender({ id: 2 });
    await waitFor(() => expect(result.current).toEqual([{ id: 'b', name: 'B album' }]));
    resolveA({ data: { configured: true, albums: [{ id: 'a', name: 'A album' }] } });
    await new Promise((r) => setTimeout(r, 0));
    expect(result.current).toEqual([{ id: 'b', name: 'B album' }]);
  });

  test('a failure returns [] and warns', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    apiService.getSpotifyArtistAlbums.mockRejectedValue(new Error('502'));
    const { result } = renderHook(() => useSpotifyArtistAlbums(5));
    await waitFor(() => expect(warn).toHaveBeenCalled());
    expect(result.current).toEqual([]);
    warn.mockRestore();
  });
});

describe('useSpotifyArtistCatalog', () => {
  const empty = { albums: [], hasOwnReleases: null, guestTracks: [] };

  test('is empty with unknown releases when the session cannot play Spotify', async () => {
    canPlay.value = false;
    const { result } = renderHook(() => useSpotifyArtistCatalog(5));
    await new Promise((r) => setTimeout(r, 0));
    expect(result.current).toEqual(empty);
  });

  test('passes hasOwnReleases and guest tracks through', async () => {
    apiService.getSpotifyArtistAlbums.mockResolvedValue({ data: {
      configured: true, albums: [], hasOwnReleases: false, guestTracks: [{ id: 'g1', name: 'Guest Spot' }],
    } });
    const { result } = renderHook(() => useSpotifyArtistCatalog(5));
    await waitFor(() => expect(result.current).toEqual({ albums: [], hasOwnReleases: false, guestTracks: [{ id: 'g1', name: 'Guest Spot' }] }));
  });

  test('an older backend without the new fields reads as unknown releases, no guest tracks', async () => {
    apiService.getSpotifyArtistAlbums.mockResolvedValue({ data: { configured: true, albums: [{ id: 'a' }] } });
    const { result } = renderHook(() => useSpotifyArtistCatalog(5));
    await waitFor(() => expect(result.current.albums).toEqual([{ id: 'a' }]));
    expect(result.current.hasOwnReleases).toBeNull();
    expect(result.current.guestTracks).toEqual([]);
  });

  test('malformed fields never leak through', async () => {
    apiService.getSpotifyArtistAlbums.mockResolvedValue({ data: {
      configured: true, albums: [], hasOwnReleases: 'no', guestTracks: [null, 'junk', { id: 'g1' }],
    } });
    const { result } = renderHook(() => useSpotifyArtistCatalog(5));
    await waitFor(() => expect(result.current.guestTracks).toEqual([{ id: 'g1' }]));
    expect(result.current.hasOwnReleases).toBeNull();
  });

  test('configured:false is empty', async () => {
    apiService.getSpotifyArtistAlbums.mockResolvedValue({ data: { configured: false, albums: [], hasOwnReleases: false, guestTracks: [{ id: 'g' }] } });
    const { result } = renderHook(() => useSpotifyArtistCatalog(5));
    await waitFor(() => expect(apiService.getSpotifyArtistAlbums).toHaveBeenCalled());
    await new Promise((r) => setTimeout(r, 0));
    expect(result.current).toEqual(empty);
  });
});

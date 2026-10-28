import { describe, test, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';

const canPlay = { value: true };
vi.mock('./useCanPlaySpotify', () => ({ useCanPlaySpotify: () => canPlay.value }));
vi.mock('../../services/api', () => ({ apiService: { getSpotifyAlbumFill: vi.fn() } }));

import { apiService } from '../../services/api';
import { useSpotifyAlbumFill } from './useSpotifyAlbumFill';

const EMPTY = { spotifyAlbum: null, tracks: [], libraryPositions: {} };
const fill = { configured: true, spotifyAlbum: { id: 'gh', name: 'Greatest Hits', imageUrl: null }, tracks: [{ position: 1, uri: 'spotify:track:a' }], libraryPositions: { 7: 10 } };

beforeEach(() => {
  canPlay.value = true;
  apiService.getSpotifyAlbumFill.mockReset();
});

describe('useSpotifyAlbumFill', () => {
  test('no request when ineligible or disabled', async () => {
    canPlay.value = false;
    const { result } = renderHook(() => useSpotifyAlbumFill(5));
    canPlay.value = true;
    const disabled = renderHook(() => useSpotifyAlbumFill(5, { enabled: false }));
    await new Promise((r) => setTimeout(r, 0));
    expect(apiService.getSpotifyAlbumFill).not.toHaveBeenCalled();
    expect(result.current).toEqual(EMPTY);
    expect(disabled.result.current).toEqual(EMPTY);
  });

  test('returns the fill when eligible', async () => {
    apiService.getSpotifyAlbumFill.mockResolvedValue({ data: fill });
    const { result } = renderHook(() => useSpotifyAlbumFill(5));
    await waitFor(() => expect(result.current.spotifyAlbum).toEqual(fill.spotifyAlbum));
    expect(result.current.tracks).toEqual(fill.tracks);
    expect(result.current.libraryPositions).toEqual({ 7: 10 });
    expect(apiService.getSpotifyAlbumFill).toHaveBeenCalledWith(5);
  });

  test('configured:false and failures are EMPTY', async () => {
    apiService.getSpotifyAlbumFill.mockResolvedValue({ data: { ...fill, configured: false } });
    const off = renderHook(() => useSpotifyAlbumFill(5));
    await waitFor(() => expect(apiService.getSpotifyAlbumFill).toHaveBeenCalled());
    await new Promise((r) => setTimeout(r, 0));
    expect(off.result.current).toEqual(EMPTY);

    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    apiService.getSpotifyAlbumFill.mockRejectedValue(new Error('502'));
    const failed = renderHook(() => useSpotifyAlbumFill(6));
    await waitFor(() => expect(warn).toHaveBeenCalled());
    expect(failed.result.current).toEqual(EMPTY);
    warn.mockRestore();
  });

  test('drops a stale response after the album changes', async () => {
    let resolveFirst;
    apiService.getSpotifyAlbumFill.mockImplementation((id) => (id === 1
      ? new Promise((r) => { resolveFirst = r; })
      : Promise.resolve({ data: { ...fill, spotifyAlbum: { id: 'two', name: 'Two', imageUrl: null } } })));
    const { result, rerender } = renderHook(({ id }) => useSpotifyAlbumFill(id), { initialProps: { id: 1 } });
    rerender({ id: 2 });
    await waitFor(() => expect(result.current.spotifyAlbum?.id).toBe('two'));
    resolveFirst({ data: fill });
    await new Promise((r) => setTimeout(r, 0));
    expect(result.current.spotifyAlbum.id).toBe('two');
  });

  test('drops malformed tracks and positions', async () => {
    apiService.getSpotifyAlbumFill.mockResolvedValue({ data: {
      configured: true, spotifyAlbum: { id: 'gh', name: 'Greatest Hits' },
      tracks: [null, 'x', { position: '3', uri: 'u' }, { position: 2.5 }, { position: 4, uri: 'ok' }],
      libraryPositions: { 1: 10, 2: 'x', 3: 1.5 },
    } });
    const { result } = renderHook(() => useSpotifyAlbumFill(5));
    await waitFor(() => expect(result.current.tracks).toEqual([{ position: 4, uri: 'ok' }]));
    expect(result.current.libraryPositions).toEqual({ 1: 10 });
  });

  test('a response with no spotifyAlbum is EMPTY even if it carries tracks', async () => {
    apiService.getSpotifyAlbumFill.mockResolvedValue({ data: { configured: true, spotifyAlbum: null, tracks: [{ position: 1, uri: 'u' }], libraryPositions: {} } });
    const { result } = renderHook(() => useSpotifyAlbumFill(5));
    await waitFor(() => expect(apiService.getSpotifyAlbumFill).toHaveBeenCalled());
    await new Promise((r) => setTimeout(r, 0));
    expect(result.current).toEqual(EMPTY);
  });
});

describe('useSpotifyAlbumFill — refreshKey', () => {
  test('a new refreshKey refetches and keeps the previous fill meanwhile', async () => {
    apiService.getSpotifyAlbumFill.mockResolvedValueOnce({ data: fill });
    let resolveSecond;
    apiService.getSpotifyAlbumFill.mockReturnValueOnce(new Promise((r) => { resolveSecond = r; }));
    const { result, rerender } = renderHook(({ k }) => useSpotifyAlbumFill(5, { refreshKey: k }), { initialProps: { k: 2 } });
    await waitFor(() => expect(result.current.tracks).toHaveLength(1));
    rerender({ k: 1 });
    await waitFor(() => expect(apiService.getSpotifyAlbumFill).toHaveBeenCalledTimes(2));
    expect(result.current.tracks).toHaveLength(1);
    resolveSecond({ data: { ...fill, tracks: [...fill.tracks, { position: 3, uri: 'spotify:track:c' }] } });
    await waitFor(() => expect(result.current.tracks).toHaveLength(2));
  });
});

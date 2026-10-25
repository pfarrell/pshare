import { describe, test, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';

vi.mock('../../services/api', () => ({ apiService: { logSpotifyPlay: vi.fn(() => Promise.resolve()) } }));

import { apiService } from '../../services/api';
import { usePlayerStore } from '../../stores/playerStore';
import { useSpotifyPlayLog, spotifyPlayFrom } from './useSpotifyPlayLog';

const track = (n) => ({
  source: 'spotify', uri: `spotify:track:${n}`, title: `T${n}`, artist: { name: 'SZA' },
  album: { title: 'SOS', spotifyId: 'sos1' }, imageUrl: 'https://i.scdn.co/x', duration: 200,
});

const initial = usePlayerStore.getState();
const set = (patch) => act(() => { usePlayerStore.setState(patch); });
const flush = () => act(async () => { await Promise.resolve(); });

beforeEach(() => {
  apiService.logSpotifyPlay.mockClear();
  usePlayerStore.setState({ activeSource: 'local', currentTrack: null, currentTime: 0 });
});
afterEach(() => usePlayerStore.setState(initial, true));

describe('useSpotifyPlayLog', () => {
  test('logs a Spotify track once, at the 5-second mark', async () => {
    renderHook(() => useSpotifyPlayLog());
    const t = track(1);
    set({ activeSource: 'spotify', currentTrack: t, currentTime: 4.9 });
    await flush();
    expect(apiService.logSpotifyPlay).not.toHaveBeenCalled();
    set({ currentTime: 5.2 });
    set({ currentTime: 9 });
    await flush();
    expect(apiService.logSpotifyPlay).toHaveBeenCalledTimes(1);
    expect(apiService.logSpotifyPlay).toHaveBeenCalledWith(spotifyPlayFrom(t));
  });

  test('a new track is logged again; local playback never is', async () => {
    renderHook(() => useSpotifyPlayLog());
    set({ activeSource: 'local', currentTrack: { id: 7, title: 'local' }, currentTime: 10 });
    set({ activeSource: 'spotify', currentTrack: track(1), currentTime: 6 });
    set({ currentTrack: track(2), currentTime: 0 });
    set({ currentTime: 6 });
    await flush();
    expect(apiService.logSpotifyPlay.mock.calls.map(([p]) => p.trackUri)).toEqual(['spotify:track:1', 'spotify:track:2']);
  });

  test('a failed log is swallowed', async () => {
    apiService.logSpotifyPlay.mockRejectedValueOnce(new Error('nope'));
    renderHook(() => useSpotifyPlayLog());
    set({ activeSource: 'spotify', currentTrack: track(1), currentTime: 6 });
    await flush();
    expect(apiService.logSpotifyPlay).toHaveBeenCalledTimes(1);
  });
});

test('spotifyPlayFrom maps a queue entry to the POST body', () => {
  expect(spotifyPlayFrom(track(3))).toEqual({
    trackUri: 'spotify:track:3', trackName: 'T3', artistName: 'SZA',
    albumSpotifyId: 'sos1', albumName: 'SOS', albumImageUrl: 'https://i.scdn.co/x',
  });
  expect(spotifyPlayFrom({ uri: 'spotify:track:4' }).albumSpotifyId).toBeNull();
});

import { renderHook, act } from '@testing-library/react';
import { usePlayerEngine } from './usePlayerEngine';
import { usePlayerStore } from '../stores/playerStore';
import { useAuthStore } from '../stores/authStore';
import { apiService } from '../services/api';

vi.mock('../services/api', () => ({
  apiService: {
    // apiService.log(...) is chained with .catch() in usePlayerEngine, so
    // the mock must return a promise like the real axios call does.
    log: vi.fn(() => Promise.resolve()),
    getImageUrl: vi.fn(() => 'http://example.com/art.jpg'),
    getAdjacentAlbums: vi.fn(),
    getAlbum: vi.fn(),
    getRandomScopeTracks: vi.fn(),
  },
}));

const makeAudioRef = () => {
  const audio = document.createElement('audio');
  Object.defineProperty(audio, 'currentTime', { writable: true, value: 0 });
  Object.defineProperty(audio, 'duration', { writable: true, value: 0 });
  return { current: audio };
};

beforeEach(() => {
  usePlayerStore.setState({
    audioElementA: null, audioElementB: null, activeSlot: 'a',
    currentTrack: null, currentTime: 0, duration: 0, isPlaying: false, isBuffering: false,
    nextTrackIndex: -1, playlist: [], playlistFinished: false, queueSource: null,
    playbackMode: 'off', currentTrackIndex: -1,
  });
  // Default to a logged-in session for these tests — the log-gating
  // behavior itself (anonymous playback must not call apiService.log) is
  // covered by its own dedicated test below.
  useAuthStore.setState({ isAuthenticated: true });
  vi.clearAllMocks();
});

test('binds both audio elements into the store on mount', () => {
  const audioRefA = makeAudioRef();
  const audioRefB = makeAudioRef();
  renderHook(() => usePlayerEngine(audioRefA, audioRefB));
  expect(usePlayerStore.getState().audioElementA).toBe(audioRefA.current);
  expect(usePlayerStore.getState().audioElementB).toBe(audioRefB.current);
});

test('unbinds both audio elements on unmount', () => {
  const audioRefA = makeAudioRef();
  const audioRefB = makeAudioRef();
  const { unmount } = renderHook(() => usePlayerEngine(audioRefA, audioRefB));
  unmount();
  expect(usePlayerStore.getState().audioElementA).toBeNull();
  expect(usePlayerStore.getState().audioElementB).toBeNull();
});

test('play/pause DOM events on the active element update isPlaying', () => {
  const audioRefA = makeAudioRef();
  const audioRefB = makeAudioRef();
  renderHook(() => usePlayerEngine(audioRefA, audioRefB));
  audioRefA.current.dispatchEvent(new Event('play'));
  expect(usePlayerStore.getState().isPlaying).toBe(true);
  audioRefA.current.dispatchEvent(new Event('pause'));
  expect(usePlayerStore.getState().isPlaying).toBe(false);
});

test('play DOM events on the standby element are ignored', () => {
  const audioRefA = makeAudioRef();
  const audioRefB = makeAudioRef();
  renderHook(() => usePlayerEngine(audioRefA, audioRefB));
  audioRefB.current.dispatchEvent(new Event('play'));
  expect(usePlayerStore.getState().isPlaying).toBe(false);
});

test('a stray play on the standby element is paused immediately, regardless of what caused it', () => {
  const audioRefA = makeAudioRef();
  const audioRefB = makeAudioRef();
  const pauseSpy = vi.spyOn(audioRefB.current, 'pause');
  renderHook(() => usePlayerEngine(audioRefA, audioRefB));
  audioRefB.current.dispatchEvent(new Event('play'));
  expect(pauseSpy).toHaveBeenCalled();
});

test('waiting/playing DOM events on the active element toggle isBuffering', () => {
  const audioRefA = makeAudioRef();
  const audioRefB = makeAudioRef();
  renderHook(() => usePlayerEngine(audioRefA, audioRefB));
  audioRefA.current.dispatchEvent(new Event('waiting'));
  expect(usePlayerStore.getState().isBuffering).toBe(true);
  audioRefA.current.dispatchEvent(new Event('playing'));
  expect(usePlayerStore.getState().isBuffering).toBe(false);
});

test('waiting DOM events on the standby element do not affect isBuffering', () => {
  const audioRefA = makeAudioRef();
  const audioRefB = makeAudioRef();
  renderHook(() => usePlayerEngine(audioRefA, audioRefB));
  audioRefB.current.dispatchEvent(new Event('waiting'));
  expect(usePlayerStore.getState().isBuffering).toBe(false);
});

test('ended on the active element calls playNext', () => {
  const audioRefA = makeAudioRef();
  const audioRefB = makeAudioRef();
  const playNext = vi.fn();
  usePlayerStore.setState({ playNext });
  renderHook(() => usePlayerEngine(audioRefA, audioRefB));
  audioRefA.current.dispatchEvent(new Event('ended'));
  expect(playNext).toHaveBeenCalled();
});

test('ended on the standby element does not call playNext', () => {
  const audioRefA = makeAudioRef();
  const audioRefB = makeAudioRef();
  const playNext = vi.fn();
  usePlayerStore.setState({ playNext });
  renderHook(() => usePlayerEngine(audioRefA, audioRefB));
  audioRefB.current.dispatchEvent(new Event('ended'));
  expect(playNext).not.toHaveBeenCalled();
});

test('after activeSlot flips to b, events are read from B, not A', () => {
  const audioRefA = makeAudioRef();
  const audioRefB = makeAudioRef();
  renderHook(() => usePlayerEngine(audioRefA, audioRefB));
  usePlayerStore.setState({ activeSlot: 'b' });
  audioRefB.current.dispatchEvent(new Event('play'));
  expect(usePlayerStore.getState().isPlaying).toBe(true);
  usePlayerStore.setState({ isPlaying: false });
  audioRefA.current.dispatchEvent(new Event('play'));
  expect(usePlayerStore.getState().isPlaying).toBe(false);
});

test('timeupdate fires apiService.log once the 5-second mark is crossed, and only once', () => {
  const audioRefA = makeAudioRef();
  const audioRefB = makeAudioRef();
  usePlayerStore.setState({ currentTrack: { id: 42 } });
  renderHook(() => usePlayerEngine(audioRefA, audioRefB));

  audioRefA.current.currentTime = 3;
  audioRefA.current.dispatchEvent(new Event('timeupdate'));
  expect(apiService.log).not.toHaveBeenCalled();

  audioRefA.current.currentTime = 6;
  audioRefA.current.dispatchEvent(new Event('timeupdate'));
  expect(apiService.log).toHaveBeenCalledWith(42);

  audioRefA.current.currentTime = 7;
  audioRefA.current.dispatchEvent(new Event('timeupdate'));
  expect(apiService.log).toHaveBeenCalledTimes(1);
});

test('anonymous playback does not call apiService.log at the 5-second mark', () => {
  useAuthStore.setState({ isAuthenticated: false });
  const audioRefA = makeAudioRef();
  const audioRefB = makeAudioRef();
  usePlayerStore.setState({ currentTrack: { id: 42 } });
  renderHook(() => usePlayerEngine(audioRefA, audioRefB));

  audioRefA.current.currentTime = 6;
  audioRefA.current.dispatchEvent(new Event('timeupdate'));
  expect(apiService.log).not.toHaveBeenCalled();
});

test('a fresh play resets the 5-second mark so it fires again on the next track', () => {
  const audioRefA = makeAudioRef();
  const audioRefB = makeAudioRef();
  usePlayerStore.setState({ currentTrack: { id: 1 } });
  renderHook(() => usePlayerEngine(audioRefA, audioRefB));

  audioRefA.current.currentTime = 6;
  audioRefA.current.dispatchEvent(new Event('timeupdate'));
  expect(apiService.log).toHaveBeenCalledTimes(1);

  usePlayerStore.setState({ currentTrack: { id: 2 } });
  audioRefA.current.dispatchEvent(new Event('play'));
  audioRefA.current.currentTime = 6;
  audioRefA.current.dispatchEvent(new Event('timeupdate'));
  expect(apiService.log).toHaveBeenCalledWith(2);
  expect(apiService.log).toHaveBeenCalledTimes(2);
});

test('timeupdate within the last 15s of the active track triggers a standby prefetch', () => {
  const audioRefA = makeAudioRef();
  const audioRefB = makeAudioRef();
  const ensureStandbyLoaded = vi.fn();
  usePlayerStore.setState({ ensureStandbyLoaded });
  renderHook(() => usePlayerEngine(audioRefA, audioRefB));

  audioRefA.current.duration = 180;
  audioRefA.current.currentTime = 170; // 10s remaining
  audioRefA.current.dispatchEvent(new Event('timeupdate'));
  expect(ensureStandbyLoaded).toHaveBeenCalled();
});

test('timeupdate outside the last 15s does not trigger a standby prefetch', () => {
  const audioRefA = makeAudioRef();
  const audioRefB = makeAudioRef();
  const ensureStandbyLoaded = vi.fn();
  usePlayerStore.setState({ ensureStandbyLoaded });
  renderHook(() => usePlayerEngine(audioRefA, audioRefB));

  audioRefA.current.duration = 180;
  audioRefA.current.currentTime = 50; // 130s remaining
  audioRefA.current.dispatchEvent(new Event('timeupdate'));
  expect(ensureStandbyLoaded).not.toHaveBeenCalled();
});

test('a nextTrackIndex change while within the prefetch window re-targets the standby load', () => {
  const audioRefA = makeAudioRef();
  const audioRefB = makeAudioRef();
  audioRefA.current.duration = 180;
  audioRefA.current.currentTime = 170; // already within the last 15s
  const ensureStandbyLoaded = vi.fn();
  usePlayerStore.setState({ ensureStandbyLoaded, nextTrackIndex: 1 });
  renderHook(() => usePlayerEngine(audioRefA, audioRefB));
  ensureStandbyLoaded.mockClear();

  act(() => usePlayerStore.setState({ nextTrackIndex: 2 }));
  expect(ensureStandbyLoaded).toHaveBeenCalled();
});

test('a nextTrackIndex change while not yet within the prefetch window does not eagerly prefetch', () => {
  const audioRefA = makeAudioRef();
  const audioRefB = makeAudioRef();
  audioRefA.current.duration = 180;
  audioRefA.current.currentTime = 10; // far from the end
  const ensureStandbyLoaded = vi.fn();
  usePlayerStore.setState({ ensureStandbyLoaded, nextTrackIndex: 1 });
  renderHook(() => usePlayerEngine(audioRefA, audioRefB));
  ensureStandbyLoaded.mockClear();

  act(() => usePlayerStore.setState({ nextTrackIndex: 2 }));
  expect(ensureStandbyLoaded).not.toHaveBeenCalled();
});

describe('queue auto-continue on natural finish', () => {
  test('does nothing when playlistFinished is true but there is no queueSource', async () => {
    const audioRefA = makeAudioRef();
    const audioRefB = makeAudioRef();
    renderHook(() => usePlayerEngine(audioRefA, audioRefB));

    await act(async () => {
      usePlayerStore.setState({ playlistFinished: true, queueSource: null });
    });

    expect(apiService.getAdjacentAlbums).not.toHaveBeenCalled();
    expect(apiService.getRandomScopeTracks).not.toHaveBeenCalled();
  });

  test('collection: fetches another random batch and keeps playing', async () => {
    apiService.getRandomScopeTracks.mockResolvedValue({ data: { tracks: [{ id: 100, title: 'New', url: '/stream/100' }] } });
    const addTracks = vi.fn();
    const setQueueSource = vi.fn();
    usePlayerStore.setState({ addTracks, setQueueSource, playlist: [{ id: 1, title: 'T1', url: '/stream/1' }] });

    const audioRefA = makeAudioRef();
    const audioRefB = makeAudioRef();
    renderHook(() => usePlayerEngine(audioRefA, audioRefB));

    await act(async () => {
      usePlayerStore.setState({ playlistFinished: true, queueSource: { type: 'collection', id: 7 } });
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(apiService.getRandomScopeTracks).toHaveBeenCalledWith('collection', 7, { limit: 25, excludeTrackIds: [1] });
    expect(addTracks).toHaveBeenCalledWith(
      [{ id: 100, title: 'New', url: '/stream/100' }],
      false,
      { playImmediately: true }
    );
    expect(setQueueSource).toHaveBeenCalledWith({ type: 'collection', id: 7 });
  });

  test('artist: fetches another random batch and keeps playing', async () => {
    apiService.getRandomScopeTracks.mockResolvedValue({ data: { tracks: [{ id: 100, title: 'New', url: '/stream/100' }] } });
    const addTracks = vi.fn();
    const setQueueSource = vi.fn();
    usePlayerStore.setState({ addTracks, setQueueSource, playlist: [{ id: 1, title: 'T1', url: '/stream/1' }] });

    const audioRefA = makeAudioRef();
    const audioRefB = makeAudioRef();
    renderHook(() => usePlayerEngine(audioRefA, audioRefB));

    await act(async () => {
      usePlayerStore.setState({ playlistFinished: true, queueSource: { type: 'artist', id: 3 } });
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(apiService.getRandomScopeTracks).toHaveBeenCalledWith('artist', 3, { limit: 25, excludeTrackIds: [1] });
    expect(setQueueSource).toHaveBeenCalledWith({ type: 'artist', id: 3 });
  });

  test('album: fetches the next-newest album by the same artist and keeps playing', async () => {
    apiService.getAdjacentAlbums.mockResolvedValue({ data: { next: { id: 11 } } });
    apiService.getAlbum.mockResolvedValue({ data: { tracks: [{ id: 100, title: 'Next Track', url: '/stream/100' }] } });
    const addTracks = vi.fn();
    const setQueueSource = vi.fn();
    usePlayerStore.setState({ addTracks, setQueueSource });

    const audioRefA = makeAudioRef();
    const audioRefB = makeAudioRef();
    renderHook(() => usePlayerEngine(audioRefA, audioRefB));

    await act(async () => {
      usePlayerStore.setState({ playlistFinished: true, queueSource: { type: 'album', id: 10 } });
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(apiService.getAdjacentAlbums).toHaveBeenCalledWith(10);
    expect(apiService.getAlbum).toHaveBeenCalledWith(11);
    expect(addTracks).toHaveBeenCalledWith(
      [{ id: 100, title: 'Next Track', url: '/stream/100' }],
      false,
      { playImmediately: true }
    );
    expect(setQueueSource).toHaveBeenCalledWith({ type: 'album', id: 11 });
  });

  test('album: does not fetch track data or advance when there is no next album', async () => {
    apiService.getAdjacentAlbums.mockResolvedValue({ data: { next: null } });
    const addTracks = vi.fn();
    usePlayerStore.setState({ addTracks });

    const audioRefA = makeAudioRef();
    const audioRefB = makeAudioRef();
    renderHook(() => usePlayerEngine(audioRefA, audioRefB));

    await act(async () => {
      usePlayerStore.setState({ playlistFinished: true, queueSource: { type: 'album', id: 10 } });
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(apiService.getAlbum).not.toHaveBeenCalled();
    expect(addTracks).not.toHaveBeenCalled();
  });

  test('playlist: does nothing', async () => {
    const addTracks = vi.fn();
    usePlayerStore.setState({ addTracks });

    const audioRefA = makeAudioRef();
    const audioRefB = makeAudioRef();
    renderHook(() => usePlayerEngine(audioRefA, audioRefB));

    await act(async () => {
      usePlayerStore.setState({ playlistFinished: true, queueSource: { type: 'playlist', id: 5 } });
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(apiService.getAdjacentAlbums).not.toHaveBeenCalled();
    expect(apiService.getRandomScopeTracks).not.toHaveBeenCalled();
    expect(addTracks).not.toHaveBeenCalled();
  });

  test('does not auto-advance while playbackMode is shuffle-scope (its own top-up effect handles this)', async () => {
    const audioRefA = makeAudioRef();
    const audioRefB = makeAudioRef();
    renderHook(() => usePlayerEngine(audioRefA, audioRefB));

    await act(async () => {
      usePlayerStore.setState({
        playlistFinished: true,
        queueSource: { type: 'collection', id: 7 },
        playbackMode: 'shuffle-scope',
        // Enough tracks that the scope shuffle top-up effect (a separate concern,
        // covered by its own describe block) doesn't also fire here.
        playlist: Array.from({ length: 10 }, (_, i) => ({ id: i + 1, title: `T${i + 1}`, url: `/stream/${i + 1}` })),
        currentTrackIndex: 0,
      });
    });

    expect(apiService.getAdjacentAlbums).not.toHaveBeenCalled();
    expect(apiService.getRandomScopeTracks).not.toHaveBeenCalled();
  });
});

describe('scope shuffle top-up', () => {
  test('does nothing when playbackMode is not shuffle-scope', async () => {
    const audioRefA = makeAudioRef();
    const audioRefB = makeAudioRef();
    renderHook(() => usePlayerEngine(audioRefA, audioRefB));

    await act(async () => {
      usePlayerStore.setState({
        playbackMode: 'shuffle',
        queueSource: { type: 'collection', id: 7 },
        playlist: [{ id: 1, title: 'T1', url: '/stream/1' }],
        currentTrackIndex: 0,
      });
    });

    expect(apiService.getRandomScopeTracks).not.toHaveBeenCalled();
  });

  test('does nothing without an active queueSource', async () => {
    const audioRefA = makeAudioRef();
    const audioRefB = makeAudioRef();
    renderHook(() => usePlayerEngine(audioRefA, audioRefB));

    await act(async () => {
      usePlayerStore.setState({
        playbackMode: 'shuffle-scope',
        queueSource: null,
        playlist: [{ id: 1, title: 'T1', url: '/stream/1' }],
        currentTrackIndex: 0,
      });
    });

    expect(apiService.getRandomScopeTracks).not.toHaveBeenCalled();
  });

  test('does not fetch while more than 5 tracks remain queued', async () => {
    const audioRefA = makeAudioRef();
    const audioRefB = makeAudioRef();
    renderHook(() => usePlayerEngine(audioRefA, audioRefB));
    const playlist = Array.from({ length: 8 }, (_, i) => ({ id: i + 1, title: `T${i + 1}`, url: `/stream/${i + 1}` }));

    await act(async () => {
      usePlayerStore.setState({
        playbackMode: 'shuffle-scope',
        queueSource: { type: 'artist', id: 3 },
        playlist,
        currentTrackIndex: 0, // 7 tracks remain after this one
      });
    });

    expect(apiService.getRandomScopeTracks).not.toHaveBeenCalled();
  });

  test('fetches and appends another batch once 5 or fewer tracks remain queued', async () => {
    apiService.getRandomScopeTracks.mockResolvedValue({ data: { tracks: [{ id: 100, title: 'New', url: '/stream/100' }] } });
    const playlist = Array.from({ length: 3 }, (_, i) => ({ id: i + 1, title: `T${i + 1}`, url: `/stream/${i + 1}` }));

    const audioRefA = makeAudioRef();
    const audioRefB = makeAudioRef();
    renderHook(() => usePlayerEngine(audioRefA, audioRefB));

    await act(async () => {
      usePlayerStore.setState({
        playbackMode: 'shuffle-scope',
        queueSource: { type: 'artist', id: 3 },
        playlist,
        currentTrackIndex: 0, // 2 tracks remain after this one
      });
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(apiService.getRandomScopeTracks).toHaveBeenCalledWith('artist', 3, { limit: 25, excludeTrackIds: [1, 2, 3] });
    expect(usePlayerStore.getState().playlist.map((t) => t.id)).toEqual([1, 2, 3, 100]);
  });

  test('does not fire a second fetch while one is already in flight', async () => {
    let resolveFetch;
    apiService.getRandomScopeTracks.mockReturnValue(new Promise((resolve) => { resolveFetch = resolve; }));
    const playlist = [{ id: 1, title: 'T1', url: '/stream/1' }];

    const audioRefA = makeAudioRef();
    const audioRefB = makeAudioRef();
    renderHook(() => usePlayerEngine(audioRefA, audioRefB));

    await act(async () => {
      usePlayerStore.setState({
        playbackMode: 'shuffle-scope',
        queueSource: { type: 'artist', id: 3 },
        playlist,
        currentTrackIndex: 0,
      });
      await Promise.resolve();
    });
    expect(apiService.getRandomScopeTracks).toHaveBeenCalledTimes(1);

    // Re-trigger the effect (new playlist reference, same remaining count) while the first fetch is still pending.
    await act(async () => {
      usePlayerStore.setState({ playlist: [...playlist] });
      await Promise.resolve();
    });
    expect(apiService.getRandomScopeTracks).toHaveBeenCalledTimes(1);

    await act(async () => {
      resolveFetch({ data: { tracks: [] } });
      await Promise.resolve();
    });
  });
});

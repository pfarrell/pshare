import { renderHook, act } from '@testing-library/react';
import { useSpotifyPlayback } from './useSpotifyPlayback';
import { createSpotifySdkAdapter } from './spotifySdk';
import { invalidateSpotifyStatus } from './statusCache';
import { usePlayerStore } from '../../stores/playerStore';
import { useAuthStore } from '../../stores/authStore';
import { apiService } from '../../services/api';
import { isJukeboxMode } from '../../jukebox/jukeboxMode';

vi.mock('./spotifySdk', () => ({ createSpotifySdkAdapter: vi.fn() }));
vi.mock('../../services/api', () => ({
  apiService: {
    getSpotifyStatus: vi.fn(),
    getSpotifyToken: vi.fn(),
  },
}));
vi.mock('../../utils/device', () => ({ isIOSDevice: vi.fn(() => false) }));
vi.mock('../../jukebox/jukeboxMode', () => ({ isJukeboxMode: vi.fn(() => false) }));

const fakeAdapter = () => {
  const handlers = {};
  const on = (key) => (cb) => { handlers[key] = cb; };
  return {
    handlers,
    load: vi.fn(() => Promise.resolve()),
    connect: vi.fn(() => Promise.resolve('device-1')),
    disconnect: vi.fn(),
    activate: vi.fn(() => Promise.resolve()),
    playUri: vi.fn(() => Promise.resolve()),
    pause: vi.fn(() => Promise.resolve()),
    resume: vi.fn(() => Promise.resolve()),
    seek: vi.fn(() => Promise.resolve()),
    getState: vi.fn(() => Promise.resolve(null)),
    onStateChange: on('state'),
    onReady: on('ready'),
    onNotReady: on('notReady'),
    onAuthError: on('authError'),
    onAccountError: on('accountError'),
    onPlaybackError: on('playbackError'),
  };
};

const spotifyTrack = { source: 'spotify', uri: 'spotify:track:1', title: 'S1', artist: { name: 'A' }, duration: 200 };

const originalActions = {
  playNext: usePlayerStore.getState().playNext,
  ensureStandbyLoaded: usePlayerStore.getState().ensureStandbyLoaded,
};

let adapter;

const status = (overrides = {}) => ({ data: { allowed: true, connected: true, devices: [], ...overrides } });

// Mounts the hook and lets the status fetch, load and connect settle.
const mount = async () => {
  const hook = renderHook(() => useSpotifyPlayback());
  await act(async () => { await vi.advanceTimersByTimeAsync(0); });
  return hook;
};

beforeEach(() => {
  vi.useFakeTimers();
  invalidateSpotifyStatus();
  adapter = fakeAdapter();
  createSpotifySdkAdapter.mockReset();
  createSpotifySdkAdapter.mockImplementation(() => adapter);
  apiService.getSpotifyStatus.mockReset();
  apiService.getSpotifyStatus.mockResolvedValue(status());
  apiService.getSpotifyToken.mockReset();
  isJukeboxMode.mockReturnValue(false);
  Object.defineProperty(window, 'isSecureContext', { value: true, configurable: true });
  useAuthStore.setState({ user: { id: 7 }, isAuthenticated: true });
  usePlayerStore.setState({
    ...originalActions,
    activeSource: 'local',
    spotifySource: null,
    playlist: [],
    currentTrackIndex: -1,
    currentTrack: null,
    isPlaying: false,
    isBuffering: false,
    currentTime: 0,
    duration: 0,
  });
});

afterEach(() => {
  vi.useRealTimers();
  usePlayerStore.setState({ ...originalActions, activeSource: 'local', spotifySource: null });
  useAuthStore.setState({ user: null, isAuthenticated: false });
});

test('does not load the SDK when status is not connected', async () => {
  apiService.getSpotifyStatus.mockResolvedValue(status({ connected: false }));
  await mount();
  expect(apiService.getSpotifyStatus).toHaveBeenCalledTimes(1);
  expect(createSpotifySdkAdapter).not.toHaveBeenCalled();
  expect(usePlayerStore.getState().spotifySource).toBeNull();
});

test('does not fetch status without a signed-in user', async () => {
  useAuthStore.setState({ user: null, isAuthenticated: false });
  await mount();
  expect(apiService.getSpotifyStatus).not.toHaveBeenCalled();
  expect(createSpotifySdkAdapter).not.toHaveBeenCalled();
});

test('does not load the SDK when the status request fails', async () => {
  const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
  apiService.getSpotifyStatus.mockRejectedValue(new Error('401'));
  await mount();
  warn.mockRestore();
  expect(createSpotifySdkAdapter).not.toHaveBeenCalled();
  expect(usePlayerStore.getState().spotifySource).toBeNull();
});

test('registers a source when eligible', async () => {
  await mount();
  expect(createSpotifySdkAdapter).toHaveBeenCalledWith(expect.objectContaining({ name: 'P·Share' }));
  expect(adapter.load).toHaveBeenCalled();
  expect(adapter.connect).toHaveBeenCalled();
  const source = usePlayerStore.getState().spotifySource;
  expect(source).not.toBeNull();
  expect(source.isAvailable()).toBe(true);
});

test('names the device P·Share Jukebox in jukebox mode', async () => {
  isJukeboxMode.mockReturnValue(true);
  await mount();
  expect(createSpotifySdkAdapter).toHaveBeenCalledWith(expect.objectContaining({ name: 'P·Share Jukebox' }));
});

test('registers nothing when the SDK fails to load', async () => {
  const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
  adapter.load.mockRejectedValue(new Error('blocked'));
  await mount();
  expect(warn).toHaveBeenCalled();
  warn.mockRestore();
  expect(usePlayerStore.getState().spotifySource).toBeNull();
});

test('getOAuthToken fetches a new token on each call', async () => {
  apiService.getSpotifyToken
    .mockResolvedValueOnce({ data: { accessToken: 'tok-1', expiresAt: 1 } })
    .mockResolvedValueOnce({ data: { accessToken: 'tok-2', expiresAt: 2 } });
  await mount();
  const { getOAuthToken } = createSpotifySdkAdapter.mock.calls[0][0];
  await expect(getOAuthToken()).resolves.toBe('tok-1');
  await expect(getOAuthToken()).resolves.toBe('tok-2');
  expect(apiService.getSpotifyToken).toHaveBeenCalledTimes(2);
});

test('getOAuthToken shares one in-flight fetch between concurrent calls', async () => {
  let resolveToken;
  apiService.getSpotifyToken.mockImplementation(() => new Promise((resolve) => { resolveToken = resolve; }));
  await mount();
  const { getOAuthToken } = createSpotifySdkAdapter.mock.calls[0][0];
  const a = getOAuthToken();
  const b = getOAuthToken();
  expect(apiService.getSpotifyToken).toHaveBeenCalledTimes(1);
  resolveToken({ data: { accessToken: 'tok', expiresAt: 1 } });
  await expect(Promise.all([a, b])).resolves.toEqual(['tok', 'tok']);
});

test('a failed token fetch warns and makes the source unavailable until a fetch succeeds', async () => {
  const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
  apiService.getSpotifyToken
    .mockRejectedValueOnce(new Error('not_connected'))
    .mockResolvedValueOnce({ data: { accessToken: 'tok', expiresAt: 1 } });
  await mount();
  const { getOAuthToken } = createSpotifySdkAdapter.mock.calls[0][0];
  const source = usePlayerStore.getState().spotifySource;
  await expect(getOAuthToken()).rejects.toThrow();
  expect(warn).toHaveBeenCalled();
  expect(source.isAvailable()).toBe(false);
  await getOAuthToken();
  expect(source.isAvailable()).toBe(true);
  warn.mockRestore();
});

describe('while a Spotify track is active', () => {
  const playSpotify = () => {
    usePlayerStore.setState({
      activeSource: 'spotify', isPlaying: true, playlist: [spotifyTrack], currentTrackIndex: 0, currentTrack: spotifyTrack,
    });
  };
  const state = (positionMs, overrides = {}) => ({
    uri: 'spotify:track:1', positionMs, durationMs: 200000, paused: false, loading: false, ...overrides,
  });
  const tick = async (ms = 250) => {
    await act(async () => { await vi.advanceTimersByTimeAsync(ms); });
  };

  test('polling updates currentTime/duration and calls playNext once near the end', async () => {
    const playNext = vi.fn();
    usePlayerStore.setState({ playNext, ensureStandbyLoaded: vi.fn() });
    await mount();
    adapter.getState.mockResolvedValue(state(30000, { loading: true }));
    await act(async () => { playSpotify(); });
    await tick();
    expect(usePlayerStore.getState().currentTime).toBe(30);
    expect(usePlayerStore.getState().duration).toBe(200);
    expect(usePlayerStore.getState().isBuffering).toBe(true);

    adapter.getState.mockResolvedValue(state(199850));
    await tick();
    await tick();
    await tick();
    expect(playNext).toHaveBeenCalledTimes(1);
  });

  describe('end of track', () => {
    let playNext;
    const settle = async (polls = 4) => {
      for (let i = 0; i < polls; i++) await tick();
    };

    beforeEach(async () => {
      playNext = vi.fn();
      usePlayerStore.setState({ playNext, ensureStandbyLoaded: vi.fn() });
      await mount();
    });

    test('a poll just outside the lead window, then the track paused back at 0, advances exactly once', async () => {
      adapter.getState.mockResolvedValue(state(199790));
      await act(async () => { playSpotify(); });
      await tick();
      expect(playNext).not.toHaveBeenCalled();
      adapter.getState.mockResolvedValue(state(0, { paused: true }));
      await settle();
      expect(playNext).toHaveBeenCalledTimes(1);
    });

    test('a poll just outside the lead window, then a different uri, advances exactly once', async () => {
      adapter.getState.mockResolvedValue(state(199790));
      await act(async () => { playSpotify(); });
      await tick();
      adapter.getState.mockResolvedValue(state(3000, { uri: 'spotify:track:autoplayed' }));
      await settle();
      expect(playNext).toHaveBeenCalledTimes(1);
    });

    test('the poll fallback alone advances when the timeout found the track not quite at the end', async () => {
      adapter.getState
        .mockResolvedValueOnce(state(199790)) // poll: arms the timeout
        .mockResolvedValueOnce(state(199500)) // timeout's check: not near enough, no advance
        .mockResolvedValue(state(0, { paused: true })); // next poll: it ended
      await act(async () => { playSpotify(); });
      await tick();
      expect(playNext).not.toHaveBeenCalled();
      await settle();
      expect(playNext).toHaveBeenCalledTimes(1);
    });

    test('the timeout path advances exactly once and does not double-fire with the fallback', async () => {
      adapter.getState.mockResolvedValue(state(199790));
      await act(async () => { playSpotify(); });
      await tick();
      await tick(20);
      expect(playNext).toHaveBeenCalledTimes(1);
      await settle();
      adapter.getState.mockResolvedValue(state(0, { paused: true }));
      await settle();
      expect(playNext).toHaveBeenCalledTimes(1);
    });

    test('a manual pause near the end does not advance', async () => {
      adapter.getState.mockResolvedValue(state(199790));
      await act(async () => { playSpotify(); });
      await tick();
      await act(async () => { usePlayerStore.setState({ isPlaying: false }); });
      adapter.getState.mockResolvedValue(state(199790, { paused: true }));
      await settle();
      expect(playNext).not.toHaveBeenCalled();
    });

    test('a seek away from the end cancels the pending timeout', async () => {
      adapter.getState.mockResolvedValue(state(199790));
      await act(async () => { playSpotify(); });
      await tick();
      await act(async () => { usePlayerStore.setState({ currentTime: 50 }); });
      adapter.getState.mockResolvedValue(state(50000));
      await settle();
      expect(playNext).not.toHaveBeenCalled();
    });
  });

  test('calls ensureStandbyLoaded within 15s of the end', async () => {
    const ensureStandbyLoaded = vi.fn();
    usePlayerStore.setState({ ensureStandbyLoaded });
    await mount();
    adapter.getState.mockResolvedValue(state(100000));
    await act(async () => { playSpotify(); });
    await tick();
    expect(ensureStandbyLoaded).not.toHaveBeenCalled();
    adapter.getState.mockResolvedValue(state(186000));
    await tick();
    expect(ensureStandbyLoaded).toHaveBeenCalled();
  });

  test('ignores state for a different track (e.g. the previous one, before start lands)', async () => {
    await mount();
    adapter.getState.mockResolvedValue(state(50000, { uri: 'spotify:track:other' }));
    await act(async () => { playSpotify(); });
    await tick();
    expect(usePlayerStore.getState().currentTime).toBe(0);
  });

  test('resyncs isPlaying from SDK state when it disagrees on consecutive polls', async () => {
    await mount();
    adapter.getState.mockResolvedValue(state(50000, { paused: true }));
    await act(async () => { playSpotify(); });
    await tick();
    expect(usePlayerStore.getState().isPlaying).toBe(true);
    await tick();
    expect(usePlayerStore.getState().isPlaying).toBe(false);

    // A rejected pause: the UI says paused but the SDK is still playing.
    adapter.getState.mockResolvedValue(state(51000, { paused: false }));
    await tick();
    await tick();
    expect(usePlayerStore.getState().isPlaying).toBe(true);
  });

  test('stops polling once Spotify is no longer the active source', async () => {
    await mount();
    adapter.getState.mockResolvedValue(state(50000));
    await act(async () => { playSpotify(); });
    await tick();
    const calls = adapter.getState.mock.calls.length;
    await act(async () => { usePlayerStore.setState({ activeSource: 'local' }); });
    await tick(1000);
    expect(adapter.getState.mock.calls.length).toBe(calls);
  });

  test('displacement while playing marks the player paused', async () => {
    await mount();
    await act(async () => { playSpotify(); });
    const source = usePlayerStore.getState().spotifySource;
    await act(async () => { await source.start(spotifyTrack); });
    act(() => adapter.handlers.state(null));
    expect(source.isDisplaced()).toBe(true);
    expect(usePlayerStore.getState().isPlaying).toBe(false);
  });
});

test('unregisters on not_ready and registers again on ready', async () => {
  await mount();
  const source = usePlayerStore.getState().spotifySource;
  act(() => adapter.handlers.notReady('device-1'));
  expect(usePlayerStore.getState().spotifySource).toBeNull();
  expect(source.isAvailable()).toBe(false);
  act(() => adapter.handlers.ready('device-2'));
  expect(usePlayerStore.getState().spotifySource).toBe(source);
  expect(source.isAvailable()).toBe(true);
});

test('clears the source on unmount', async () => {
  const { unmount } = await mount();
  expect(usePlayerStore.getState().spotifySource).not.toBeNull();
  unmount();
  expect(usePlayerStore.getState().spotifySource).toBeNull();
  expect(adapter.disconnect).toHaveBeenCalled();
});

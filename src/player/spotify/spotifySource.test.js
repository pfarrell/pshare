import { createSpotifySource } from './spotifySource';

const deferred = () => {
  let resolve;
  let reject;
  const promise = new Promise((res, rej) => { resolve = res; reject = rej; });
  return { promise, resolve, reject };
};

const fakeAdapter = (overrides = {}) => {
  const handlers = { state: [] };
  return {
    handlers,
    emitState: (state) => handlers.state.forEach((cb) => cb(state)),
    playUri: vi.fn(() => Promise.resolve()),
    pause: vi.fn(() => Promise.resolve()),
    resume: vi.fn(() => Promise.resolve()),
    seek: vi.fn(() => Promise.resolve()),
    activate: vi.fn(() => Promise.resolve()),
    getState: vi.fn(() => Promise.resolve(null)),
    onStateChange: (cb) => { handlers.state.push(cb); },
    ...overrides,
  };
};

const flush = async () => {
  for (let i = 0; i < 10; i++) await Promise.resolve();
};

const spotifyTrack = (n) => ({ source: 'spotify', uri: `spotify:track:${n}`, title: `S${n}`, duration: 200 });

const readySource = (adapter, options) => {
  const source = createSpotifySource(adapter, options);
  source.setDeviceId('device-1');
  return source;
};

test('is unavailable until it has a device id', () => {
  const source = createSpotifySource(fakeAdapter());
  expect(source.isAvailable()).toBe(false);
  source.setDeviceId('device-1');
  expect(source.isAvailable()).toBe(true);
  source.setDeviceId(null);
  expect(source.isAvailable()).toBe(false);
});

test('a failed token fetch does not disable Spotify: a later start is still attempted', async () => {
  const adapter = fakeAdapter();
  const source = readySource(adapter);
  // The hook only warns on a token failure; it no longer tells the source about it.
  expect(source.isAvailable()).toBe(true);
  await source.start(spotifyTrack(1));
  expect(adapter.playUri).toHaveBeenCalled();
});

test('start calls playUri with the track uri and the device id', async () => {
  const adapter = fakeAdapter();
  const source = readySource(adapter);
  await source.start(spotifyTrack(1));
  expect(adapter.playUri).toHaveBeenCalledWith('spotify:track:1', 'device-1');
});

test('start rejects without a device', async () => {
  const adapter = fakeAdapter();
  const source = createSpotifySource(adapter);
  await expect(source.start(spotifyTrack(1))).rejects.toThrow();
  expect(adapter.playUri).not.toHaveBeenCalled();
});

test('null state while playing marks it displaced and calls onDisplaced; clearDisplaced resets it', async () => {
  const adapter = fakeAdapter();
  const onDisplaced = vi.fn();
  const source = readySource(adapter, { onDisplaced });
  await source.start(spotifyTrack(1));
  expect(source.isDisplaced()).toBe(false);

  adapter.emitState(null);
  expect(source.isDisplaced()).toBe(true);
  expect(onDisplaced).toHaveBeenCalledTimes(1);

  source.clearDisplaced();
  expect(source.isDisplaced()).toBe(false);
});

test('null state while not playing (paused, or before start resolves) is not displacement', async () => {
  const adapter = fakeAdapter();
  const onDisplaced = vi.fn();
  const source = readySource(adapter, { onDisplaced });
  adapter.emitState(null);
  await source.start(spotifyTrack(1));
  await source.pause();
  adapter.emitState(null);
  expect(source.isDisplaced()).toBe(false);
  expect(onDisplaced).not.toHaveBeenCalled();
});

test('starts are serialized: a newer start waits for the pending one, and a start superseded while waiting is never sent', async () => {
  const first = deferred();
  const adapter = fakeAdapter({
    playUri: vi.fn((uri) => (uri === 'spotify:track:1' ? first.promise : Promise.resolve())),
  });
  const source = readySource(adapter);
  const p1 = source.start(spotifyTrack(1));
  await flush();
  const p2 = source.start(spotifyTrack(2));
  const p3 = source.start(spotifyTrack(3));
  await flush();
  // Only the first PUT is in flight; nothing newer has hit the device yet.
  expect(adapter.playUri.mock.calls.map((c) => c[0])).toEqual(['spotify:track:1']);

  first.resolve();
  await Promise.all([p1, p2, p3]);
  // Track 2 was superseded by 3 before its turn, so it never reached the device; 3 lands last.
  expect(adapter.playUri.mock.calls.map((c) => c[0])).toEqual(['spotify:track:1', 'spotify:track:3']);
});

test('a superseded start that resolves does not count as playing', async () => {
  const first = deferred();
  const second = deferred();
  const adapter = fakeAdapter({
    playUri: vi.fn((uri) => (uri === 'spotify:track:1' ? first.promise : second.promise)),
  });
  const onDisplaced = vi.fn();
  const source = readySource(adapter, { onDisplaced });
  source.start(spotifyTrack(1));
  await flush();
  source.start(spotifyTrack(2));
  first.resolve();
  await flush();
  // Track 2 is still starting, so a null state now is not displacement.
  adapter.emitState(null);
  expect(onDisplaced).not.toHaveBeenCalled();
  second.resolve();
  await flush();
  adapter.emitState(null);
  expect(onDisplaced).toHaveBeenCalledTimes(1);
});

test('starts requested in the same tick collapse to the latest', async () => {
  const adapter = fakeAdapter();
  const source = readySource(adapter);
  await Promise.all([source.start(spotifyTrack(1)), source.start(spotifyTrack(2))]);
  expect(adapter.playUri.mock.calls.map((c) => c[0])).toEqual(['spotify:track:2']);
});

test('resume after displacement takes playback back by restarting the last track', async () => {
  const adapter = fakeAdapter();
  const source = readySource(adapter);
  await source.start(spotifyTrack(1));
  adapter.emitState(null);
  expect(source.isDisplaced()).toBe(true);
  await source.resume();
  expect(adapter.resume).not.toHaveBeenCalled();
  expect(adapter.playUri).toHaveBeenCalledTimes(2);
  expect(adapter.playUri).toHaveBeenLastCalledWith('spotify:track:1', 'device-1');
  expect(source.isDisplaced()).toBe(false);
});

test('a failed start does not block the next one', async () => {
  const adapter = fakeAdapter({
    playUri: vi.fn((uri) => (uri === 'spotify:track:1' ? Promise.reject(new Error('nope')) : Promise.resolve())),
  });
  const source = readySource(adapter);
  await expect(source.start(spotifyTrack(1))).rejects.toThrow('nope');
  await source.start(spotifyTrack(2));
  expect(adapter.playUri).toHaveBeenLastCalledWith('spotify:track:2', 'device-1');
});

test('isSettled is false while a command is in flight', async () => {
  const pending = deferred();
  const adapter = fakeAdapter({ pause: vi.fn(() => pending.promise) });
  const source = readySource(adapter);
  expect(source.isSettled()).toBe(true);
  const paused = source.pause();
  expect(source.isSettled()).toBe(false);
  pending.resolve();
  await paused;
  expect(source.isSettled()).toBe(true);
});

test('pause, resume and seek go to the adapter; seek converts seconds to ms', async () => {
  const adapter = fakeAdapter();
  const source = readySource(adapter);
  await source.pause();
  await source.resume();
  await source.seek(42.5);
  expect(adapter.pause).toHaveBeenCalled();
  expect(adapter.resume).toHaveBeenCalled();
  expect(adapter.seek).toHaveBeenCalledWith(42500);
});

test('activate calls the adapter and swallows a rejection', async () => {
  const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
  const adapter = fakeAdapter({ activate: vi.fn(() => Promise.reject(new Error('no gesture'))) });
  const source = readySource(adapter);
  source.activate();
  await flush();
  expect(adapter.activate).toHaveBeenCalled();
  expect(warn).toHaveBeenCalled();
  warn.mockRestore();
});

test('playback nobody asked for (a timed-out start landing late) is paused', async () => {
  const adapter = fakeAdapter({ playUri: vi.fn(() => Promise.reject(new Error('timed out'))) });
  const source = readySource(adapter);
  await expect(source.start(spotifyTrack(1))).rejects.toThrow();
  adapter.emitState({ uri: 'spotify:track:1', positionMs: 0, durationMs: 200000, paused: false, loading: false });
  expect(adapter.pause).toHaveBeenCalledTimes(1);
});

test('playback that was asked for, or is still starting, is left alone', async () => {
  const pending = deferred();
  const adapter = fakeAdapter({ playUri: vi.fn(() => pending.promise) });
  const source = readySource(adapter);
  const playingState = { uri: 'spotify:track:1', positionMs: 0, durationMs: 200000, paused: false, loading: false };
  const started = source.start(spotifyTrack(1));
  await flush();
  adapter.emitState(playingState); // start still in flight
  pending.resolve();
  await started;
  adapter.emitState(playingState); // started
  await source.pause();
  await source.resume();
  adapter.emitState(playingState); // resumed
  expect(adapter.pause).toHaveBeenCalledTimes(1); // only the explicit pause()
});

describe('stale device: rebuild the player and retry once', () => {
  const staleError = () => Object.assign(new Error('Spotify did not start in time'), { staleDevice: true });

  test('a stale-device failure reconnects and retries the same track on the new device', async () => {
    const adapter = fakeAdapter({
      playUri: vi.fn()
        .mockImplementationOnce(() => Promise.reject(staleError()))
        .mockImplementation(() => Promise.resolve()),
    });
    const reconnect = vi.fn(() => Promise.resolve('device-2'));
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const source = readySource(adapter, { reconnect });

    await source.start(spotifyTrack(1));
    warn.mockRestore();

    expect(reconnect).toHaveBeenCalledTimes(1);
    expect(adapter.playUri).toHaveBeenNthCalledWith(1, 'spotify:track:1', 'device-1');
    expect(adapter.playUri).toHaveBeenNthCalledWith(2, 'spotify:track:1', 'device-2');
    expect(source.isAvailable()).toBe(true);
  });

  test('retries only once: a second stale failure rejects', async () => {
    const adapter = fakeAdapter({ playUri: vi.fn(() => Promise.reject(staleError())) });
    const reconnect = vi.fn(() => Promise.resolve('device-2'));
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const source = readySource(adapter, { reconnect });

    await expect(source.start(spotifyTrack(1))).rejects.toThrow();
    warn.mockRestore();
    expect(reconnect).toHaveBeenCalledTimes(1);
    expect(adapter.playUri).toHaveBeenCalledTimes(2);
  });

  test('other failures do not reconnect', async () => {
    const adapter = fakeAdapter({ playUri: vi.fn(() => Promise.reject(new Error('403'))) });
    const reconnect = vi.fn(() => Promise.resolve('device-2'));
    const source = readySource(adapter, { reconnect });

    await expect(source.start(spotifyTrack(1))).rejects.toThrow('403');
    expect(reconnect).not.toHaveBeenCalled();
    expect(adapter.playUri).toHaveBeenCalledTimes(1);
  });

  test('a failed reconnect rejects with the reconnect error and leaves no device', async () => {
    const adapter = fakeAdapter({ playUri: vi.fn(() => Promise.reject(staleError())) });
    const reconnect = vi.fn(() => Promise.reject(new Error('refused to connect')));
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const source = readySource(adapter, { reconnect });

    await expect(source.start(spotifyTrack(1))).rejects.toThrow('refused to connect');
    warn.mockRestore();
    expect(adapter.playUri).toHaveBeenCalledTimes(1);
    expect(source.isAvailable()).toBe(false);
  });

  test('a start superseded while reconnecting is not retried', async () => {
    const reconnecting = deferred();
    const adapter = fakeAdapter({
      playUri: vi.fn()
        .mockImplementationOnce(() => Promise.reject(staleError()))
        .mockImplementation(() => Promise.resolve()),
    });
    const reconnect = vi.fn(() => reconnecting.promise);
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const source = readySource(adapter, { reconnect });

    const first = source.start(spotifyTrack(1));
    await flush();
    const second = source.start(spotifyTrack(2));
    reconnecting.resolve('device-2');
    await first.catch(() => {});
    await second;
    warn.mockRestore();

    expect(adapter.playUri.mock.calls.map(([uri]) => uri)).toEqual(['spotify:track:1', 'spotify:track:2']);
    expect(adapter.playUri).toHaveBeenLastCalledWith('spotify:track:2', 'device-2');
  });
});

test('setVolume forwards to the adapter without counting as an in-flight command', async () => {
  const adapter = fakeAdapter({ setVolume: vi.fn(() => new Promise(() => {})) });
  const source = readySource(adapter);
  source.setVolume(0.4);
  expect(adapter.setVolume).toHaveBeenCalledWith(0.4);
  expect(source.isSettled()).toBe(true);
});

test('setVolume is a no-op on an adapter without volume support', async () => {
  const source = readySource(fakeAdapter());
  await expect(source.setVolume(0.4)).resolves.toBeUndefined();
});

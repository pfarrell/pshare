import { renderHook, waitFor } from '@testing-library/react';
import { useJukeboxQueueEvents } from './useJukeboxQueueEvents';
import { usePlayerStore } from '../stores/playerStore';
import { apiService, jukeboxEventsUrl } from '../services/api';
import { invalidateProfilesCache } from '../utils/profilesCache';
import { requestJukeboxStatePublish } from './jukeboxStatePublisher';

vi.mock('../services/api', () => ({
  apiService: {
    getJukeboxPendingQueue: vi.fn(),
    markJukeboxDelivered: vi.fn(),
    getTrack: vi.fn(),
  },
  jukeboxEventsUrl: vi.fn((id) => `/api/jukebox/devices/${id}/events`),
}));

vi.mock('./jukeboxStatePublisher', () => ({ requestJukeboxStatePublish: vi.fn() }));

vi.mock('../utils/profilesCache', () => ({
  invalidateProfilesCache: vi.fn(),
}));

// jsdom has no native EventSource — a small fake that this test file drives
// directly by calling the handlers JukeboxApp's real code registers.
class FakeEventSource {
  constructor(url) {
    this.url = url;
    this.listeners = {};
    FakeEventSource.instances.push(this);
    // Real EventSource fires 'open' asynchronously once connected. Schedule
    // it as a microtask so it fires after the hook's synchronous effect body
    // (which registers the 'open' listener right after construction) has
    // run, without every test needing to emit it manually. Tests that want
    // to simulate a reconnect call `source.emit('open')` again themselves.
    queueMicrotask(() => this.emit('open'));
  }
  addEventListener(type, handler) {
    this.listeners[type] = handler;
  }
  close() {
    this.closed = true;
  }
  emit(type, data) {
    this.listeners[type]?.({ data: JSON.stringify(data) });
  }
}
FakeEventSource.instances = [];

beforeEach(() => {
  vi.clearAllMocks();
  FakeEventSource.instances = [];
  global.EventSource = FakeEventSource;
  usePlayerStore.setState({ playlist: [] });
  apiService.getJukeboxPendingQueue.mockResolvedValue({ data: [] });
});

test('does nothing when deviceId is null', () => {
  renderHook(() => useJukeboxQueueEvents(null));
  expect(FakeEventSource.instances.length).toBe(0);
});

test('opens an EventSource for the given device, fetches pending on connect, resolves and adds each track', async () => {
  apiService.getJukeboxPendingQueue.mockResolvedValue({
    data: [{ id: 1, track_id: 10, submitted_by_name: 'Riley', submitted_by_user_id: null }],
  });
  apiService.getTrack.mockResolvedValue({ data: { track: { id: 10, title: 'Pending Track' } } });
  const addTracks = vi.fn();
  usePlayerStore.setState({ addTracks });

  renderHook(() => useJukeboxQueueEvents(5));

  expect(jukeboxEventsUrl).toHaveBeenCalledWith(5);
  await waitFor(() => expect(apiService.getJukeboxPendingQueue).toHaveBeenCalledWith(5));
  await waitFor(() => expect(apiService.getTrack).toHaveBeenCalledWith(10));
  await waitFor(() => expect(addTracks).toHaveBeenCalledWith([{ id: 10, title: 'Pending Track' }]));
  await waitFor(() => expect(apiService.markJukeboxDelivered).toHaveBeenCalledWith(5, 1));
});

test('a queue-item-added event resolves and adds the track, then marks it delivered', async () => {
  apiService.getTrack.mockResolvedValue({ data: { track: { id: 20, title: 'Live Track' } } });
  const addTracks = vi.fn();
  usePlayerStore.setState({ addTracks });
  renderHook(() => useJukeboxQueueEvents(5));
  await waitFor(() => expect(apiService.getJukeboxPendingQueue).toHaveBeenCalled());

  const source = FakeEventSource.instances[0];
  source.emit('queue-item-added', { id: 2, track_id: 20, submitted_by_name: 'Riley', submitted_by_user_id: null });

  await waitFor(() => expect(apiService.getTrack).toHaveBeenCalledWith(20));
  await waitFor(() => expect(addTracks).toHaveBeenCalledWith([{ id: 20, title: 'Live Track' }]));
  await waitFor(() => expect(apiService.markJukeboxDelivered).toHaveBeenCalledWith(5, 2));
});

test('a profiles-changed event invalidates the profiles cache', async () => {
  renderHook(() => useJukeboxQueueEvents(5));
  await waitFor(() => expect(apiService.getJukeboxPendingQueue).toHaveBeenCalled());

  const source = FakeEventSource.instances[0];
  source.emit('profiles-changed', {});

  await waitFor(() => expect(invalidateProfilesCache).toHaveBeenCalled());
});

test('closes the EventSource on unmount', async () => {
  const { unmount } = renderHook(() => useJukeboxQueueEvents(5));
  await waitFor(() => expect(apiService.getJukeboxPendingQueue).toHaveBeenCalled());
  const source = FakeEventSource.instances[0];

  unmount();

  expect(source.closed).toBe(true);
});

test('a second open event (reconnect) re-fetches the pending queue but does not re-deliver an already-delivered submission', async () => {
  apiService.getJukeboxPendingQueue.mockResolvedValue({
    data: [{ id: 1, track_id: 10, submitted_by_name: 'Riley', submitted_by_user_id: null }],
  });
  apiService.getTrack.mockResolvedValue({ data: { track: { id: 10, title: 'Pending Track' } } });
  const addTracks = vi.fn();
  usePlayerStore.setState({ addTracks });

  renderHook(() => useJukeboxQueueEvents(5));
  await waitFor(() => expect(apiService.getJukeboxPendingQueue).toHaveBeenCalledTimes(1));
  await waitFor(() => expect(addTracks).toHaveBeenCalledTimes(1));

  const source = FakeEventSource.instances[0];
  source.emit('open');

  await waitFor(() => expect(apiService.getJukeboxPendingQueue).toHaveBeenCalledTimes(2));
  // Give an incorrect re-delivery a chance to happen before asserting it didn't.
  await new Promise((resolve) => setTimeout(resolve, 0));
  expect(addTracks).toHaveBeenCalledTimes(1);
});

test('delivers multiple pending submissions to addTracks in submission order, not network-resolution order', async () => {
  apiService.getJukeboxPendingQueue.mockResolvedValue({
    data: [
      { id: 1, track_id: 10, submitted_by_name: 'Riley', submitted_by_user_id: null },
      { id: 2, track_id: 20, submitted_by_name: 'Sam', submitted_by_user_id: null },
    ],
  });
  // Track 10 is first in submission order but resolves slower than track 20,
  // reproducing the network-order scrambling scenario.
  apiService.getTrack.mockImplementation((trackId) => {
    const delay = trackId === 10 ? 20 : 0;
    return new Promise((resolve) => {
      setTimeout(() => resolve({ data: { track: { id: trackId, title: `Track ${trackId}` } } }), delay);
    });
  });
  const addTracks = vi.fn();
  usePlayerStore.setState({ addTracks });

  renderHook(() => useJukeboxQueueEvents(5));

  await waitFor(() => expect(addTracks).toHaveBeenCalled());
  expect(addTracks).toHaveBeenCalledTimes(1);
  expect(addTracks).toHaveBeenCalledWith([
    { id: 10, title: 'Track 10' },
    { id: 20, title: 'Track 20' },
  ]);
});

test('a failed getTrack lookup is not marked delivered and is retried on the next open/reconnect', async () => {
  apiService.getJukeboxPendingQueue.mockResolvedValue({
    data: [{ id: 1, track_id: 10, submitted_by_name: 'Riley', submitted_by_user_id: null }],
  });
  apiService.getTrack.mockRejectedValueOnce(new Error('boom'));
  apiService.getTrack.mockResolvedValueOnce({ data: { track: { id: 10, title: 'Pending Track' } } });
  const addTracks = vi.fn();
  usePlayerStore.setState({ addTracks });

  renderHook(() => useJukeboxQueueEvents(5));
  await waitFor(() => expect(apiService.getJukeboxPendingQueue).toHaveBeenCalledTimes(1));
  await waitFor(() => expect(apiService.getTrack).toHaveBeenCalledTimes(1));

  // Give the (failed) delivery attempt a chance to settle before asserting.
  await new Promise((resolve) => setTimeout(resolve, 0));
  expect(addTracks).not.toHaveBeenCalled();
  expect(apiService.markJukeboxDelivered).not.toHaveBeenCalled();

  const source = FakeEventSource.instances[0];
  source.emit('open');

  await waitFor(() => expect(apiService.getTrack).toHaveBeenCalledTimes(2));
  await waitFor(() => expect(addTracks).toHaveBeenCalledWith([{ id: 10, title: 'Pending Track' }]));
  await waitFor(() => expect(apiService.markJukeboxDelivered).toHaveBeenCalledWith(5, 1));
});

describe('playback-command events (remote control from a logged-in phone)', () => {
  const setupActions = () => {
    const actions = { togglePlayPause: vi.fn(), playNext: vi.fn(), playPrev: vi.fn() };
    usePlayerStore.setState(actions);
    return actions;
  };

  test('toggle calls togglePlayPause', () => {
    const actions = setupActions();
    renderHook(() => useJukeboxQueueEvents(5));

    FakeEventSource.instances[0].emit('playback-command', { command: 'toggle' });

    expect(actions.togglePlayPause).toHaveBeenCalledTimes(1);
    expect(actions.playNext).not.toHaveBeenCalled();
    expect(actions.playPrev).not.toHaveBeenCalled();
  });

  test('next calls playNext as a manual advance, like the footer button', () => {
    const actions = setupActions();
    renderHook(() => useJukeboxQueueEvents(5));

    FakeEventSource.instances[0].emit('playback-command', { command: 'next' });

    expect(actions.playNext).toHaveBeenCalledWith({ manual: true });
    expect(actions.togglePlayPause).not.toHaveBeenCalled();
  });

  test('prev calls playPrev', () => {
    const actions = setupActions();
    renderHook(() => useJukeboxQueueEvents(5));

    FakeEventSource.instances[0].emit('playback-command', { command: 'prev' });

    expect(actions.playPrev).toHaveBeenCalledTimes(1);
  });

  test('ignores unknown, missing or malformed commands without throwing', () => {
    const actions = setupActions();
    renderHook(() => useJukeboxQueueEvents(5));
    const source = FakeEventSource.instances[0];

    source.emit('playback-command', { command: 'seek' });
    source.emit('playback-command', { command: 'volume-up' });
    source.emit('playback-command', {});
    source.emit('playback-command', null);
    source.listeners['playback-command']({ data: 'not json {' });

    expect(actions.togglePlayPause).not.toHaveBeenCalled();
    expect(actions.playNext).not.toHaveBeenCalled();
    expect(actions.playPrev).not.toHaveBeenCalled();
  });
});

describe('jump and remove commands (queue control from a logged-in phone)', () => {
  const track = (id) => ({ id, title: `Song ${id}` });
  const setup = (playlist) => {
    const actions = { playTrackAtIndex: vi.fn(), removeTrackFromPlaylist: vi.fn() };
    usePlayerStore.setState({ playlist, ...actions });
    renderHook(() => useJukeboxQueueEvents(5));
    return { actions, source: FakeEventSource.instances[0] };
  };

  test('jump plays the row when it still holds that track, then republishes', () => {
    const { actions, source } = setup([track(1), track(2), track(3)]);
    requestJukeboxStatePublish.mockClear();

    source.emit('playback-command', { command: 'jump', index: 2, trackId: 3 });

    expect(actions.playTrackAtIndex).toHaveBeenCalledWith(2);
    expect(requestJukeboxStatePublish).toHaveBeenCalled();
  });

  test('remove removes the row when it still holds that track, then republishes', () => {
    const { actions, source } = setup([track(1), track(2), track(3)]);
    requestJukeboxStatePublish.mockClear();

    source.emit('playback-command', { command: 'remove', index: 1, trackId: 2 });

    expect(actions.removeTrackFromPlaylist).toHaveBeenCalledWith(1);
    expect(requestJukeboxStatePublish).toHaveBeenCalled();
  });

  test('a stale command (the row now holds a different track) does nothing but republish', () => {
    const { actions, source } = setup([track(1), track(9), track(3)]);
    requestJukeboxStatePublish.mockClear();

    source.emit('playback-command', { command: 'jump', index: 1, trackId: 2 });
    source.emit('playback-command', { command: 'remove', index: 1, trackId: 2 });

    expect(actions.playTrackAtIndex).not.toHaveBeenCalled();
    expect(actions.removeTrackFromPlaylist).not.toHaveBeenCalled();
    expect(requestJukeboxStatePublish).toHaveBeenCalledTimes(2);
  });

  test('with duplicate tracks the command hits the addressed row, not the first match', () => {
    const { actions, source } = setup([track(7), track(4), track(7)]);

    source.emit('playback-command', { command: 'remove', index: 2, trackId: 7 });

    expect(actions.removeTrackFromPlaylist).toHaveBeenCalledTimes(1);
    expect(actions.removeTrackFromPlaylist).toHaveBeenCalledWith(2);
  });

  test('an index past the end of the queue is ignored', () => {
    const { actions, source } = setup([track(1)]);
    source.emit('playback-command', { command: 'jump', index: 5, trackId: 1 });
    expect(actions.playTrackAtIndex).not.toHaveBeenCalled();
  });

  test('missing, negative, fractional or string fields are ignored without throwing', () => {
    const { actions, source } = setup([track(1), track(2)]);
    const bad = [
      { command: 'jump' },
      { command: 'jump', index: 0 },
      { command: 'jump', trackId: 1 },
      { command: 'jump', index: -1, trackId: 1 },
      { command: 'remove', index: 0.5, trackId: 1 },
      { command: 'remove', index: '0', trackId: 1 },
    ];
    for (const payload of bad) source.emit('playback-command', payload);
    expect(actions.playTrackAtIndex).not.toHaveBeenCalled();
    expect(actions.removeTrackFromPlaylist).not.toHaveBeenCalled();
  });

  test('every event-stream open (connect and reconnect) republishes the queue', async () => {
    setup([track(1)]);
    await waitFor(() => expect(requestJukeboxStatePublish).toHaveBeenCalled());
    requestJukeboxStatePublish.mockClear();

    FakeEventSource.instances[0].emit('open');

    expect(requestJukeboxStatePublish).toHaveBeenCalledTimes(1);
  });
});

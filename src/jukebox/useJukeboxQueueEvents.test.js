import { renderHook, waitFor } from '@testing-library/react';
import { useJukeboxQueueEvents } from './useJukeboxQueueEvents';
import { usePlayerStore } from '../stores/playerStore';
import { apiService, jukeboxEventsUrl } from '../services/api';
import { invalidateProfilesCache } from '../utils/profilesCache';

vi.mock('../services/api', () => ({
  apiService: {
    getJukeboxPendingQueue: vi.fn(),
    markJukeboxDelivered: vi.fn(),
    getTrack: vi.fn(),
  },
  jukeboxEventsUrl: vi.fn((id) => `/api/jukebox/devices/${id}/events`),
}));

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

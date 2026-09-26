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

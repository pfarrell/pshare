import { renderHook, act } from '@testing-library/react';
import { usePlayerStore } from '../stores/playerStore';
import { apiService } from '../services/api';
import {
  buildQueueSnapshot,
  useJukeboxStatePublisher,
  requestJukeboxStatePublish,
  PUBLISH_THROTTLE_MS,
} from './jukeboxStatePublisher';

vi.mock('../services/api', () => ({
  apiService: { publishJukeboxState: vi.fn() },
}));

const track = (id, extra = {}) => ({ id, title: `Song ${id}`, artist: { id: 1, name: `Artist ${id}` }, ...extra });

describe('buildQueueSnapshot', () => {
  test('lists the current track onward with absolute indices, never history', () => {
    const snap = buildQueueSnapshot({
      playlist: [track(1), track(2), track(3), track(4), track(5)],
      currentTrackIndex: 2,
      isPlaying: true,
    });
    expect(snap.currentIndex).toBe(2);
    expect(snap.isPlaying).toBe(true);
    expect(snap.queue).toEqual([
      { index: 2, id: 3, title: 'Song 3', artist: 'Artist 3' },
      { index: 3, id: 4, title: 'Song 4', artist: 'Artist 4' },
      { index: 4, id: 5, title: 'Song 5', artist: 'Artist 5' },
    ]);
  });

  test('starts at the top when nothing is playing yet', () => {
    const snap = buildQueueSnapshot({ playlist: [track(1), track(2)], currentTrackIndex: -1, isPlaying: false });
    expect(snap.currentIndex).toBe(-1);
    expect(snap.queue.map((q) => q.index)).toEqual([0, 1]);
  });

  test('an empty playlist gives an empty queue', () => {
    expect(buildQueueSnapshot({ playlist: [], currentTrackIndex: -1, isPlaying: false }))
      .toEqual({ queue: [], currentIndex: -1, isPlaying: false });
  });

  test('is null-safe for a missing artist, blank artist, or missing title', () => {
    const snap = buildQueueSnapshot({
      playlist: [track(1, { artist: null }), track(2, { artist: {} }), { id: 3 }],
      currentTrackIndex: 0,
      isPlaying: false,
    });
    expect(snap.queue.map((q) => q.artist)).toEqual([null, null, null]);
    expect(snap.queue[2].title).toBe('');
  });

  test('caps the queue at 300 entries', () => {
    const playlist = Array.from({ length: 450 }, (_, i) => track(i + 1));
    const snap = buildQueueSnapshot({ playlist, currentTrackIndex: 10, isPlaying: true });
    expect(snap.queue).toHaveLength(300);
    expect(snap.queue[0].index).toBe(10);
  });
});

describe('useJukeboxStatePublisher', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    apiService.publishJukeboxState.mockResolvedValue({ data: { ok: true } });
    usePlayerStore.setState({ playlist: [track(1), track(2)], currentTrackIndex: 0, isPlaying: false, currentTime: 0 });
  });
  afterEach(() => vi.useRealTimers());

  test('does nothing until a device id is known', () => {
    renderHook(() => useJukeboxStatePublisher(null));
    act(() => { usePlayerStore.setState({ isPlaying: true }); });
    vi.advanceTimersByTime(PUBLISH_THROTTLE_MS * 3);
    expect(apiService.publishJukeboxState).not.toHaveBeenCalled();
  });

  test('publishes the current snapshot on mount', () => {
    renderHook(() => useJukeboxStatePublisher(5));
    expect(apiService.publishJukeboxState).toHaveBeenCalledTimes(1);
    expect(apiService.publishJukeboxState.mock.calls[0][0]).toBe(5);
    expect(apiService.publishJukeboxState.mock.calls[0][1].queue).toHaveLength(2);
  });

  test('a burst of changes publishes once after the throttle window with the latest state', () => {
    renderHook(() => useJukeboxStatePublisher(5));
    apiService.publishJukeboxState.mockClear();

    act(() => { usePlayerStore.setState({ playlist: [track(1), track(2), track(3)] }); });
    act(() => { usePlayerStore.setState({ playlist: [track(1), track(2), track(3), track(4)] }); });
    act(() => { usePlayerStore.setState({ isPlaying: true }); });
    expect(apiService.publishJukeboxState).not.toHaveBeenCalled();

    act(() => { vi.advanceTimersByTime(PUBLISH_THROTTLE_MS); });

    expect(apiService.publishJukeboxState).toHaveBeenCalledTimes(1);
    const snap = apiService.publishJukeboxState.mock.calls[0][1];
    expect(snap.queue).toHaveLength(4);
    expect(snap.isPlaying).toBe(true);
  });

  test('changes to playback position alone do not publish', () => {
    renderHook(() => useJukeboxStatePublisher(5));
    apiService.publishJukeboxState.mockClear();

    act(() => { usePlayerStore.setState({ currentTime: 12 }); });
    act(() => { vi.advanceTimersByTime(PUBLISH_THROTTLE_MS * 2); });

    expect(apiService.publishJukeboxState).not.toHaveBeenCalled();
  });

  test('requestJukeboxStatePublish publishes immediately, bypassing the throttle', () => {
    renderHook(() => useJukeboxStatePublisher(5));
    apiService.publishJukeboxState.mockClear();

    act(() => { requestJukeboxStatePublish(); });

    expect(apiService.publishJukeboxState).toHaveBeenCalledTimes(1);
  });

  test('a failed publish is swallowed and later changes still publish', async () => {
    renderHook(() => useJukeboxStatePublisher(5));
    apiService.publishJukeboxState.mockClear();
    apiService.publishJukeboxState.mockRejectedValueOnce(new Error('offline'));

    act(() => { usePlayerStore.setState({ isPlaying: true }); });
    await act(async () => { vi.advanceTimersByTime(PUBLISH_THROTTLE_MS); });
    act(() => { usePlayerStore.setState({ isPlaying: false }); });
    await act(async () => { vi.advanceTimersByTime(PUBLISH_THROTTLE_MS); });

    expect(apiService.publishJukeboxState).toHaveBeenCalledTimes(2);
  });

  test('unmounting stops publishing and makes requestJukeboxStatePublish a no-op', () => {
    const { unmount } = renderHook(() => useJukeboxStatePublisher(5));
    unmount();
    apiService.publishJukeboxState.mockClear();

    act(() => { usePlayerStore.setState({ isPlaying: true }); });
    act(() => { vi.advanceTimersByTime(PUBLISH_THROTTLE_MS * 2); });
    requestJukeboxStatePublish();

    expect(apiService.publishJukeboxState).not.toHaveBeenCalled();
  });
});

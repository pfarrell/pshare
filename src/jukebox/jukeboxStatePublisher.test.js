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
      .toEqual({ queue: [], currentIndex: -1, isPlaying: false, playbackMode: 'off' });
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

  test('in shuffle it lists what is still left to play (not queue order), current track first', () => {
    const snap = buildQueueSnapshot({
      playlist: [track(1), track(2), track(3), track(4), track(5)],
      currentTrackIndex: 3,
      isPlaying: true,
      playbackMode: 'shuffle',
      shuffleHistory: [0, 3],
    });
    expect(snap.playbackMode).toBe('shuffle');
    expect(snap.currentIndex).toBe(3);
    // track 1 (index 0) was already played, so it is gone; indices 1, 2 and 4 are
    // all still to come even though 1 and 2 sit before the current track.
    expect(snap.queue.map((q) => q.index)).toEqual([3, 1, 2, 4]);
  });

  test('in shuffle with nothing played yet, every track is left to play', () => {
    const snap = buildQueueSnapshot({
      playlist: [track(1), track(2), track(3)],
      currentTrackIndex: -1,
      isPlaying: false,
      playbackMode: 'shuffle',
      shuffleHistory: [],
    });
    expect(snap.queue.map((q) => q.index)).toEqual([0, 1, 2]);
    expect(snap.currentIndex).toBe(-1);
  });

  test('in shuffle it caps at 300 entries and keeps the current track first', () => {
    const playlist = Array.from({ length: 450 }, (_, i) => track(i + 1));
    const snap = buildQueueSnapshot({ playlist, currentTrackIndex: 100, isPlaying: true, playbackMode: 'shuffle', shuffleHistory: [100] });
    expect(snap.queue).toHaveLength(300);
    expect(snap.queue[0].index).toBe(100);
  });

  test('other modes keep the current-onward order and just report the mode', () => {
    for (const playbackMode of ['off', 'shuffle-scope', 'repeat-all', 'repeat-one']) {
      const snap = buildQueueSnapshot({
        playlist: [track(1), track(2), track(3), track(4)],
        currentTrackIndex: 1,
        isPlaying: true,
        playbackMode,
        shuffleHistory: [0, 1],
      });
      expect(snap.playbackMode).toBe(playbackMode);
      expect(snap.queue.map((q) => q.index)).toEqual([1, 2, 3]);
    }
  });

  test('a missing mode is reported as off', () => {
    expect(buildQueueSnapshot({ playlist: [track(1)], currentTrackIndex: 0, isPlaying: false }).playbackMode).toBe('off');
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
    usePlayerStore.setState({ playlist: [track(1), track(2)], currentTrackIndex: 0, isPlaying: false, currentTime: 0, playbackMode: 'off', shuffleHistory: [] });
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

  test('a change of playback mode or of the shuffle history publishes', () => {
    renderHook(() => useJukeboxStatePublisher(5));
    apiService.publishJukeboxState.mockClear();

    act(() => { usePlayerStore.setState({ playbackMode: 'shuffle' }); });
    act(() => { vi.advanceTimersByTime(PUBLISH_THROTTLE_MS); });
    expect(apiService.publishJukeboxState).toHaveBeenCalledTimes(1);
    expect(apiService.publishJukeboxState.mock.calls[0][1].playbackMode).toBe('shuffle');

    act(() => { usePlayerStore.setState({ shuffleHistory: [0] }); });
    act(() => { vi.advanceTimersByTime(PUBLISH_THROTTLE_MS); });
    expect(apiService.publishJukeboxState).toHaveBeenCalledTimes(2);
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

import { renderHook, act } from '@testing-library/react';
import { useGuestQueue, QUEUE_POLL_MS } from './useGuestQueue';
import { apiService } from '../../services/api';

vi.mock('../../services/api', () => ({
  apiService: { getJukeboxQueue: vi.fn() },
}));

const setVisibility = (state) => {
  Object.defineProperty(document, 'visibilityState', { value: state, configurable: true });
  document.dispatchEvent(new Event('visibilitychange'));
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers();
  Object.defineProperty(document, 'visibilityState', { value: 'visible', configurable: true });
  apiService.getJukeboxQueue.mockResolvedValue({ data: { connected: true, queue: [], currentIndex: -1, isPlaying: false } });
});
afterEach(() => vi.useRealTimers());

test('fetches on mount and exposes the data', async () => {
  const { result } = renderHook(() => useGuestQueue('tok'));
  await act(async () => { await Promise.resolve(); });
  expect(apiService.getJukeboxQueue).toHaveBeenCalledWith('tok');
  expect(result.current.data.connected).toBe(true);
  expect(result.current.loading).toBe(false);
});

test('polls every few seconds while visible', async () => {
  renderHook(() => useGuestQueue('tok'));
  await act(async () => { await Promise.resolve(); });
  apiService.getJukeboxQueue.mockClear();

  await act(async () => { await vi.advanceTimersByTimeAsync(QUEUE_POLL_MS * 3); });

  expect(apiService.getJukeboxQueue).toHaveBeenCalledTimes(3);
});

test('does not poll while the page is hidden, and refreshes as soon as it is visible again', async () => {
  renderHook(() => useGuestQueue('tok'));
  await act(async () => { await Promise.resolve(); });
  apiService.getJukeboxQueue.mockClear();

  act(() => { setVisibility('hidden'); });
  await act(async () => { await vi.advanceTimersByTimeAsync(QUEUE_POLL_MS * 3); });
  expect(apiService.getJukeboxQueue).not.toHaveBeenCalled();

  await act(async () => { setVisibility('visible'); await Promise.resolve(); });
  expect(apiService.getJukeboxQueue).toHaveBeenCalledTimes(1);
});

test('stops polling and stops listening after unmount', async () => {
  const { unmount } = renderHook(() => useGuestQueue('tok'));
  await act(async () => { await Promise.resolve(); });
  unmount();
  apiService.getJukeboxQueue.mockClear();

  await act(async () => { await vi.advanceTimersByTimeAsync(QUEUE_POLL_MS * 3); });
  act(() => { setVisibility('visible'); });

  expect(apiService.getJukeboxQueue).not.toHaveBeenCalled();
});

test('keeps showing the last good data through a transient error', async () => {
  const { result } = renderHook(() => useGuestQueue('tok'));
  await act(async () => { await Promise.resolve(); });
  apiService.getJukeboxQueue.mockRejectedValueOnce(new Error('blip'));

  await act(async () => { await vi.advanceTimersByTimeAsync(QUEUE_POLL_MS); });

  expect(result.current.data.connected).toBe(true);
  expect(result.current.error).toBeTruthy();
});

test('a 404 sets notFound', async () => {
  apiService.getJukeboxQueue.mockRejectedValue({ response: { status: 404 } });
  const { result } = renderHook(() => useGuestQueue('tok'));
  await act(async () => { await Promise.resolve(); });
  expect(result.current.notFound).toBe(true);
});

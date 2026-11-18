import { renderHook } from '@testing-library/react';
import { useNasWarmup, WARMUP_INTERVAL_MS, resetNasWarmupForTests } from './useNasWarmup';
import { apiService } from '../services/api';

vi.mock('../services/api', () => ({
  apiService: { warmMusicStore: vi.fn(() => Promise.resolve()) },
}));

const setVisibility = (state) => {
  Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => state });
  document.dispatchEvent(new Event('visibilitychange'));
};

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(1_000_000);
  apiService.warmMusicStore.mockClear();
  resetNasWarmupForTests();
  Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'visible' });
});
afterEach(() => vi.useRealTimers());

test('warms once when the app opens', () => {
  renderHook(() => useNasWarmup());
  expect(apiService.warmMusicStore).toHaveBeenCalledTimes(1);
});

test('user activity warms again only after the interval', () => {
  renderHook(() => useNasWarmup());
  window.dispatchEvent(new Event('pointerdown'));
  expect(apiService.warmMusicStore).toHaveBeenCalledTimes(1);

  vi.advanceTimersByTime(WARMUP_INTERVAL_MS + 1);
  window.dispatchEvent(new Event('pointerdown'));
  expect(apiService.warmMusicStore).toHaveBeenCalledTimes(2);

  vi.advanceTimersByTime(WARMUP_INTERVAL_MS + 1);
  window.dispatchEvent(new Event('keydown'));
  expect(apiService.warmMusicStore).toHaveBeenCalledTimes(3);
});

test('returning to the app warms (after the interval); hiding it does not', () => {
  renderHook(() => useNasWarmup());
  vi.advanceTimersByTime(WARMUP_INTERVAL_MS + 1);
  setVisibility('hidden');
  expect(apiService.warmMusicStore).toHaveBeenCalledTimes(1);
  setVisibility('visible');
  expect(apiService.warmMusicStore).toHaveBeenCalledTimes(2);
});

test('a failed request is ignored', async () => {
  apiService.warmMusicStore.mockImplementationOnce(() => Promise.reject(new Error('offline')));
  renderHook(() => useNasWarmup());
  await Promise.resolve();
  expect(apiService.warmMusicStore).toHaveBeenCalledTimes(1);
});

test('a remount (StrictMode) does not ping again', () => {
  const first = renderHook(() => useNasWarmup());
  first.unmount();
  renderHook(() => useNasWarmup());
  expect(apiService.warmMusicStore).toHaveBeenCalledTimes(1);
});

test('stops listening on unmount', () => {
  const { unmount } = renderHook(() => useNasWarmup());
  unmount();
  vi.advanceTimersByTime(WARMUP_INTERVAL_MS + 1);
  window.dispatchEvent(new Event('pointerdown'));
  expect(apiService.warmMusicStore).toHaveBeenCalledTimes(1);
});

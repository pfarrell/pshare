import { renderHook, act } from '@testing-library/react';
import { useGuestEnqueue } from './useGuestEnqueue';
import { apiService } from '../../services/api';

vi.mock('../../services/api', () => ({
  apiService: { submitToJukebox: vi.fn() },
}));

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers();
  localStorage.setItem('jukebox-guest-name', 'Riley');
  apiService.submitToJukebox.mockResolvedValue({ data: [] });
});
afterEach(() => vi.useRealTimers());

test('submits ids with the stored name and reports added, then resets to idle', async () => {
  const { result } = renderHook(() => useGuestEnqueue('tok'));
  await act(async () => { await result.current.enqueue('t1', [1, 2, 3]); });

  expect(apiService.submitToJukebox).toHaveBeenCalledWith('tok', [1, 2, 3], 'Riley');
  expect(result.current.statusFor('t1').state).toBe('added');
  await act(async () => { await vi.advanceTimersByTimeAsync(2100); });
  expect(result.current.statusFor('t1').state).toBe('idle');
});

test('resolves a lazy id source and submits in chunks of 500', async () => {
  const ids = Array.from({ length: 1200 }, (_, i) => i + 1);
  const { result } = renderHook(() => useGuestEnqueue('tok'));
  await act(async () => { await result.current.enqueue('big', () => Promise.resolve(ids)); });

  expect(apiService.submitToJukebox).toHaveBeenCalledTimes(3);
  expect(apiService.submitToJukebox.mock.calls.map((c) => c[1].length)).toEqual([500, 500, 200]);
  expect(result.current.statusFor('big').state).toBe('added');
});

test('an empty id list reports empty and submits nothing', async () => {
  const { result } = renderHook(() => useGuestEnqueue('tok'));
  await act(async () => { await result.current.enqueue('none', []); });

  expect(apiService.submitToJukebox).not.toHaveBeenCalled();
  expect(result.current.statusFor('none').state).toBe('empty');
});

test('a 429 reports slow and stops submitting further chunks', async () => {
  apiService.submitToJukebox
    .mockResolvedValueOnce({ data: [] })
    .mockRejectedValueOnce({ response: { status: 429 } });
  const ids = Array.from({ length: 1200 }, (_, i) => i + 1);
  const { result } = renderHook(() => useGuestEnqueue('tok'));
  await act(async () => { await result.current.enqueue('k', ids); });

  expect(apiService.submitToJukebox).toHaveBeenCalledTimes(2);
  expect(result.current.statusFor('k').state).toBe('slow');
});

test('any other failure reports error', async () => {
  apiService.submitToJukebox.mockRejectedValue(new Error('boom'));
  const { result } = renderHook(() => useGuestEnqueue('tok'));
  await act(async () => { await result.current.enqueue('k', [1]); });

  expect(result.current.statusFor('k').state).toBe('error');
});

test('reports the resolved track count while adding', async () => {
  let release;
  apiService.submitToJukebox.mockImplementation(() => new Promise((r) => { release = r; }));
  const { result } = renderHook(() => useGuestEnqueue('tok'));
  let pending;
  act(() => { pending = result.current.enqueue('k', [1, 2, 3, 4]); });
  await act(async () => { await Promise.resolve(); });

  expect(result.current.statusFor('k')).toEqual({ state: 'adding', count: 4 });
  await act(async () => { release({ data: [] }); await pending; });
});

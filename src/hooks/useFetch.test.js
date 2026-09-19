import { renderHook, waitFor, act } from '@testing-library/react';
import { useFetch } from './useFetch';

const deferred = () => {
  let resolve;
  let reject;
  const promise = new Promise((res, rej) => { resolve = res; reject = rej; });
  return { promise, resolve, reject };
};

describe('useFetch', () => {
  test('starts loading, then exposes data', async () => {
    const { result } = renderHook(() => useFetch(() => Promise.resolve({ ok: 1 }), []));
    expect(result.current.loading).toBe(true);
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.data).toEqual({ ok: 1 });
    expect(result.current.error).toBeNull();
  });

  test('exposes errors', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const err = new Error('nope');
    const { result } = renderHook(() => useFetch(() => Promise.reject(err), []));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.error).toBe(err);
    expect(result.current.data).toBeNull();
  });

  test('drops a stale response when deps change mid-flight', async () => {
    const first = deferred();
    const second = deferred();
    const fetchers = { 1: () => first.promise, 2: () => second.promise };
    const { result, rerender } = renderHook(({ id }) => useFetch(fetchers[id], [id]), { initialProps: { id: 1 } });
    rerender({ id: 2 });
    await act(async () => { second.resolve('two'); });
    await act(async () => { first.resolve('one'); });
    expect(result.current.data).toBe('two');
  });

  test('reload refetches', async () => {
    const fetcher = vi.fn().mockResolvedValueOnce('a').mockResolvedValueOnce('b');
    const { result } = renderHook(() => useFetch(fetcher, []));
    await waitFor(() => expect(result.current.data).toBe('a'));
    act(() => result.current.reload());
    await waitFor(() => expect(result.current.data).toBe('b'));
    expect(fetcher).toHaveBeenCalledTimes(2);
  });
});

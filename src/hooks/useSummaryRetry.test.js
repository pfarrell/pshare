import { renderHook, waitFor, act } from '@testing-library/react';
import { useSummaryRetry } from './useSummaryRetry';

const hit = (text) => ({ summary: text, url: `https://en.wikipedia.org/wiki/${text}` });

const deferred = () => {
  let resolve;
  const promise = new Promise((res) => { resolve = res; });
  return { promise, resolve };
};

describe('useSummaryRetry', () => {
  test('passes the page summary through without refetching when it has content', () => {
    const fetchSummary = vi.fn();
    const { result } = renderHook(() => useSummaryRetry(hit('Page'), fetchSummary, { loaded: true, key: 1 }));
    expect(result.current).toEqual(hit('Page'));
    expect(fetchSummary).not.toHaveBeenCalled();
  });

  test('does nothing until the page has loaded', () => {
    const fetchSummary = vi.fn();
    renderHook(() => useSummaryRetry(undefined, fetchSummary, { loaded: false, key: 1 }));
    expect(fetchSummary).not.toHaveBeenCalled();
  });

  test('fetches the summary again when the page came back without one', async () => {
    const fetchSummary = vi.fn().mockResolvedValue(hit('Retried'));
    const { result } = renderHook(() => useSummaryRetry(null, fetchSummary, { loaded: true, key: 1 }));
    await waitFor(() => expect(result.current).toEqual(hit('Retried')));
    expect(fetchSummary).toHaveBeenCalledTimes(1);
  });

  test('treats an empty summary object as missing', async () => {
    const fetchSummary = vi.fn().mockResolvedValue(hit('Retried'));
    const { result } = renderHook(() => useSummaryRetry({}, fetchSummary, { loaded: true, key: 1 }));
    await waitFor(() => expect(result.current).toEqual(hit('Retried')));
  });

  test('a failed retry leaves the page summary as it was', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    const fetchSummary = vi.fn().mockRejectedValue(new Error('down'));
    const { result } = renderHook(() => useSummaryRetry(null, fetchSummary, { loaded: true, key: 1 }));
    await waitFor(() => expect(fetchSummary).toHaveBeenCalled());
    await act(async () => {});
    expect(result.current).toBeNull();
  });

  test('a retry for a previous page never shows on the next one', async () => {
    const first = deferred();
    const fetchers = { 1: () => first.promise, 2: () => new Promise(() => {}) };
    const { result, rerender } = renderHook(
      ({ id }) => useSummaryRetry(null, fetchers[id], { loaded: true, key: id }),
      { initialProps: { id: 1 } }
    );
    rerender({ id: 2 });
    await act(async () => { first.resolve(hit('Stale')); });
    expect(result.current).toBeNull();
  });
});

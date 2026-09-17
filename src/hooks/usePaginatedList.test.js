import { renderHook, waitFor, act } from '@testing-library/react';
import { usePaginatedList } from './usePaginatedList';

beforeEach(() => { window.scrollTo = vi.fn(); });

describe('usePaginatedList', () => {
  test('loads page 1, moves to page 2, ignores out-of-range pages', async () => {
    const fetchPage = vi.fn((page) => Promise.resolve({ items: [`row-${page}`], pagination: { page, totalPages: 2 } }));
    const { result } = renderHook(() => usePaginatedList(fetchPage));
    await waitFor(() => expect(result.current.items).toEqual(['row-1']));
    act(() => result.current.goToPage(2));
    await waitFor(() => expect(result.current.items).toEqual(['row-2']));
    act(() => result.current.goToPage(3));
    expect(result.current.page).toBe(2);
    expect(fetchPage).toHaveBeenCalledTimes(2);
  });

  test('setItems updates the current page locally', async () => {
    const fetchPage = vi.fn(() => Promise.resolve({ items: [1, 2, 3], pagination: { page: 1, totalPages: 1 } }));
    const { result } = renderHook(() => usePaginatedList(fetchPage));
    await waitFor(() => expect(result.current.items).toEqual([1, 2, 3]));
    act(() => result.current.setItems((prev) => prev.filter((x) => x !== 2)));
    expect(result.current.items).toEqual([1, 3]);
  });
});

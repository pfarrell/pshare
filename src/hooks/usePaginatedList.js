// src/hooks/usePaginatedList.js
import { useState } from 'react';
import { useFetch } from './useFetch';

// One page of an admin table at a time. fetchPage(page) resolves to
// { items, pagination: { page, limit, total, totalPages } }.
export const usePaginatedList = (fetchPage) => {
  const [page, setPage] = useState(1);
  const { data, setData, loading, error, reload } = useFetch(() => fetchPage(page), [page]);

  const goToPage = (next) => {
    if (next < 1 || (data?.pagination && next > data.pagination.totalPages)) return;
    setPage(next);
    window.scrollTo(0, 0);
  };

  const setItems = (update) => setData((current) => current && ({
    ...current,
    items: typeof update === 'function' ? update(current.items) : update,
  }));

  return { items: data?.items ?? [], setItems, pagination: data?.pagination ?? null, page, goToPage, loading, error, reload };
};

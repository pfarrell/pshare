import { useState } from 'react';
import { apiService } from '../services/api';

// 'artist-admin' uses the admin artist search (includes stub artists with
// album counts); the others use the global search endpoint.
export const fetchEntitySearch = async (kind, query) => {
  if (kind === 'artist-admin') {
    const response = await apiService.searchAdminArtists(query);
    return response.data || [];
  }
  const response = await apiService.search(query);
  if (kind === 'track') return response.data.tracks || [];
  return (response.data.results || []).filter((r) => r.type === kind).map((r) => r.data);
};

export const useEntitySearch = (kind, { minLength = 2, filterResults } = {}) => {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState([]);
  const [searching, setSearching] = useState(false);
  const [hasSearched, setHasSearched] = useState(false);

  const search = async () => {
    if (query.trim().length < minLength) return;
    setSearching(true);
    try {
      const found = await fetchEntitySearch(kind, query);
      setResults(filterResults ? filterResults(found) : found);
      setHasSearched(true);
    } catch (err) {
      console.error('Search failed:', err);
    } finally {
      setSearching(false);
    }
  };

  const clearResults = () => {
    setResults([]);
    setHasSearched(false);
  };

  const reset = () => {
    setQuery('');
    clearResults();
  };

  return { query, setQuery, results, setResults, searching, hasSearched, search, reset, clearResults, minLength };
};

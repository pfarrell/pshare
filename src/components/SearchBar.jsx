// src/components/SearchBar.jsx
import { useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { usePlayerStore } from '../stores/playerStore';

const SearchBar = ({ onSearch, className = "" }) => {
  const [query, setQuery] = useState('');
  const navigate = useNavigate();
  const inputRef = useRef(null);
  const closeDrawer = usePlayerStore((s) => s.closeDrawer);

  const handleSearch = async (e) => {
    e.preventDefault();
    if (!query.trim()) return;

    // Blur the input to dismiss the keyboard on mobile
    if (inputRef.current) {
      inputRef.current.blur();
    }

    closeDrawer();

    if (onSearch) {
      onSearch(query);
    } else {
      navigate(`/search?q=${encodeURIComponent(query)}`);
    }
  };

  const handleClear = () => {
    setQuery('');
    if (inputRef.current) {
      inputRef.current.focus();
    }
  };

  return (
    <form onSubmit={handleSearch} style={{ width: '100%' }} className={className}>
      <div className="search-input-wrapper">
        <input
          ref={inputRef}
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search for songs, artists, or albums"
          className="search-input"
          autoComplete="off"
          autoCorrect="off"
          autoCapitalize="off"
          spellCheck="false"
        />
        {query && (
          <button
            type="button"
            className="search-clear-button"
            onClick={handleClear}
            aria-label="Clear search"
          >
            &times;
          </button>
        )}
      </div>
    </form>
  );
};

export default SearchBar;

import { useState, useEffect } from 'react';
import { Link, Outlet, useNavigate, useSearchParams, useLocation } from 'react-router-dom';
import { useGuest } from './useGuest';
import GuestRemote from './GuestRemote';

const GuestShell = () => {
  const { path } = useGuest();
  const navigate = useNavigate();
  const location = useLocation();
  const [params] = useSearchParams();
  const onSearchRoute = location.pathname.endsWith('/search');
  const [query, setQuery] = useState(onSearchRoute ? (params.get('q') ?? '') : '');
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => { setMenuOpen(false); }, [location.pathname]);

  const handleSubmit = (e) => {
    e.preventDefault();
    const q = query.trim();
    if (!q) return;
    navigate(`${path('search')}?q=${encodeURIComponent(q)}`);
  };

  return (
    <div className="jukebox-guest">
      <header className="jukebox-guest-header">
        <form className="jukebox-guest-search" role="search" onSubmit={handleSubmit}>
          <input
            type="search"
            placeholder="Search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            enterKeyHint="search"
            autoComplete="off"
          />
        </form>
        <button
          type="button"
          className="jukebox-guest-menu-button"
          aria-label="Menu"
          aria-expanded={menuOpen}
          onClick={() => setMenuOpen((open) => !open)}
        >
          ☰
        </button>
        {menuOpen && (
          <nav className="jukebox-guest-menu">
            <Link to={path('')}>Home</Link>
            <Link to={path('playlists')}>Playlists</Link>
            <Link to={path('collections')}>Collections</Link>
          </nav>
        )}
      </header>
      <main className="jukebox-guest-content">
        <Outlet />
      </main>
      <GuestRemote />
    </div>
  );
};

export default GuestShell;

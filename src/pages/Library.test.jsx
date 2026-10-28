import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import Library from './Library';
import { useFavoritesStore } from '../stores/favoritesStore';
import { useAuthStore } from '../stores/authStore';

vi.mock('../services/api', () => ({
  apiService: {
    getImageUrl: () => 'http://example.com/image.jpg',
  },
}));

const renderLibrary = () =>
  render(
    <MemoryRouter>
      <Library />
    </MemoryRouter>
  );

beforeEach(() => {
  useAuthStore.setState({ isAuthenticated: true });
  useFavoritesStore.setState({
    items: [],
    loading: false,
    loaded: true,
    load: vi.fn(),
  });
});

test('shows an empty state for the default (Artists) tab when there are no favorites', () => {
  renderLibrary();
  expect(screen.getByText('No favorite artists yet.')).toBeInTheDocument();
});

test('renders a favorited artist on the Artists tab', () => {
  useFavoritesStore.setState({
    items: [{ id: 1, kind: 'artist', target_id: 5, item: { id: 5, name: 'Test Artist', image_path: null } }],
    loading: false,
    loaded: true,
    load: vi.fn(),
  });
  renderLibrary();
  expect(screen.getByText('Test Artist')).toBeInTheDocument();
});

test('switching to the Albums tab shows favorited albums and hides artists', () => {
  useFavoritesStore.setState({
    items: [
      { id: 1, kind: 'artist', target_id: 5, item: { id: 5, name: 'Test Artist', image_path: null } },
      { id: 2, kind: 'album', target_id: 8, item: { id: 8, title: 'Test Album', image_path: null, artist: { id: 5, name: 'Test Artist' } } },
    ],
    loading: false,
    loaded: true,
    load: vi.fn(),
  });
  renderLibrary();

  fireEvent.click(screen.getByText('Albums'));

  expect(screen.getByText('Test Album')).toBeInTheDocument();
  expect(screen.queryByText('No favorite')).not.toBeInTheDocument();
});

test('a favorite whose target row was deleted (item: null) is skipped, not rendered as an error', () => {
  useFavoritesStore.setState({
    items: [{ id: 1, kind: 'artist', target_id: 999, item: null }],
    loading: false,
    loaded: true,
    load: vi.fn(),
  });
  renderLibrary();
  expect(screen.getByText('No favorite artists yet.')).toBeInTheDocument();
});

test('calls load() on mount when favorites have not been loaded yet', () => {
  const load = vi.fn();
  useFavoritesStore.setState({ items: [], loading: false, loaded: false, load });
  renderLibrary();
  expect(load).toHaveBeenCalled();
});

test('renders a favorited album with no artist (orphaned album, artist: null) without crashing', () => {
  // Regression test: server/src/routes/favorites.ts hydrates an orphaned
  // album's artist as a literal `null` (albums.artist_id has no FK — see
  // CLAUDE.md), and this project has no error boundary anywhere, so an
  // unguarded `artist.name` dereference in AlbumCard's desktop render
  // branch would blank the entire app. jsdom's default window.innerWidth
  // (1024) is above useIsMobile's 768px breakpoint, so this already
  // exercises the desktop (non-mobile) branch that crashed.
  expect(window.innerWidth).toBeGreaterThan(768);
  useFavoritesStore.setState({
    items: [
      { id: 2, kind: 'album', target_id: 8, item: { id: 8, title: 'Orphaned Album', image_path: null, artist: null } },
    ],
    loading: false,
    loaded: true,
    load: vi.fn(),
  });
  renderLibrary();

  fireEvent.click(screen.getByText('Albums'));

  expect(screen.getByText('Orphaned Album')).toBeInTheDocument();
});

test('favorited tracks render with the row layout and no position numbers', () => {
  useFavoritesStore.setState({
    items: [{ id: 3, kind: 'track', target_id: 4, item: { id: 4, title: 'Fave Track', duration: 100, artist: { id: 1, name: 'A' }, album: { id: 2, title: 'B' } } }],
    loading: false,
    loaded: true,
    load: vi.fn(),
  });
  const { container } = renderLibrary();
  fireEvent.click(screen.getByRole('button', { name: /Tracks/ }));
  expect(container.querySelector('.track-row')).toBeInTheDocument();
  expect(screen.queryByText(/01\./)).not.toBeInTheDocument();
});

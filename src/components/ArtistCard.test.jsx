import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import ArtistCard from './ArtistCard';
import { useAuthStore } from '../stores/authStore';
import { useFavoritesStore } from '../stores/favoritesStore';
import { useViewModeStore } from '../stores/viewModeStore';
import { apiService } from '../services/api';
import { usePlayerStore } from '../stores/playerStore';

vi.mock('../services/api', () => ({
  apiService: {
    getRandomScopeTracks: vi.fn(),
  },
}));

const artist = { id: 1, name: 'Test Artist', image_path: 'x.jpg' };

afterEach(() => {
  Object.defineProperty(window, 'innerWidth', { value: 1024, configurable: true });
});

test('shows the album count on desktop', () => {
  render(<ArtistCard artist={{ ...artist, album_count: 5 }} onClick={vi.fn()} imageUrl="/img/sm/x.jpg" />);
  expect(screen.getByText('5 albums')).toBeInTheDocument();
});

test('clicking the desktop card calls onClick with the artist', () => {
  const onClick = vi.fn();
  render(<ArtistCard artist={artist} onClick={onClick} imageUrl="/img/sm/x.jpg" />);
  fireEvent.click(screen.getByText('Test Artist'));
  expect(onClick).toHaveBeenCalledWith(artist);
});

describe('mobile row layout', () => {
  beforeEach(() => {
    Object.defineProperty(window, 'innerWidth', { value: 500, configurable: true });
  });

  test('shows "Artist" as the subtitle, without an album count', () => {
    render(<ArtistCard artist={{ ...artist, album_count: 5 }} onClick={vi.fn()} imageUrl="/img/sm/x.jpg" />);
    expect(screen.getByText('Artist')).toBeInTheDocument();
    expect(screen.queryByText(/album/)).toBeNull();
  });

  test('clicking the row calls onClick with the artist', () => {
    const onClick = vi.fn();
    render(<ArtistCard artist={artist} onClick={onClick} imageUrl="/img/sm/x.jpg" />);
    fireEvent.click(screen.getByText('Test Artist'));
    expect(onClick).toHaveBeenCalledWith(artist);
  });
});

describe('desktop list-mode row layout', () => {
  beforeEach(() => {
    Object.defineProperty(window, 'innerWidth', { value: 1024, configurable: true });
    useViewModeStore.setState({ mode: 'list' });
  });

  afterEach(() => {
    useViewModeStore.setState({ mode: 'card' });
  });

  test('shows "Artist" as the subtitle, without an album count', () => {
    render(<ArtistCard artist={{ ...artist, album_count: 5 }} onClick={vi.fn()} imageUrl="/img/sm/x.jpg" />);
    expect(screen.getByText('Artist')).toBeInTheDocument();
    expect(screen.queryByText(/5 album/)).toBeNull();
  });

  test('clicking the row calls onClick with the artist', () => {
    const onClick = vi.fn();
    render(<ArtistCard artist={artist} onClick={onClick} imageUrl="/img/sm/x.jpg" />);
    fireEvent.click(screen.getByText('Test Artist'));
    expect(onClick).toHaveBeenCalledWith(artist);
  });
});

describe('ArtistCard — Favorite menu item', () => {
  beforeEach(() => {
    useAuthStore.setState({ isAuthenticated: false });
    useFavoritesStore.setState({ isFavorite: () => false, toggleFavorite: vi.fn() });
  });

  test('right-click does nothing when logged out', () => {
    render(<ArtistCard artist={artist} onClick={vi.fn()} imageUrl="/img/sm/x.jpg" />);
    fireEvent.contextMenu(screen.getByText('Test Artist').closest('.artist-card'));
    expect(screen.queryByText(/Favorites/)).not.toBeInTheDocument();
  });

  test('right-click shows the Favorite item when logged in', () => {
    useAuthStore.setState({ isAuthenticated: true });
    render(<ArtistCard artist={artist} onClick={vi.fn()} imageUrl="/img/sm/x.jpg" />);
    fireEvent.contextMenu(screen.getByText('Test Artist').closest('.artist-card'));
    expect(screen.getByText('☆ Add to Favorites')).toBeInTheDocument();
  });

  test('clicking it calls toggleFavorite with the artist kind/id', () => {
    useAuthStore.setState({ isAuthenticated: true });
    const toggleFavorite = vi.fn();
    useFavoritesStore.setState({ isFavorite: () => false, toggleFavorite });
    render(<ArtistCard artist={artist} onClick={vi.fn()} imageUrl="/img/sm/x.jpg" />);
    fireEvent.contextMenu(screen.getByText('Test Artist').closest('.artist-card'));

    fireEvent.click(screen.getByText('☆ Add to Favorites'));

    expect(toggleFavorite).toHaveBeenCalledWith('artist', artist.id, expect.objectContaining({ id: artist.id, name: artist.name }));
  });

  test('shows "Remove from Favorites" when already favorited', () => {
    useAuthStore.setState({ isAuthenticated: true });
    useFavoritesStore.setState({ isFavorite: () => true, toggleFavorite: vi.fn() });
    render(<ArtistCard artist={artist} onClick={vi.fn()} imageUrl="/img/sm/x.jpg" />);
    fireEvent.contextMenu(screen.getByText('Test Artist').closest('.artist-card'));
    expect(screen.getByText('★ Remove from Favorites')).toBeInTheDocument();
  });
});

describe('play button', () => {
  beforeEach(() => {
    // Play button aria-label lookup below matches the ResultRow (mobile/list)
    // render path, same as AlbumCard's play-button tests.
    Object.defineProperty(window, 'innerWidth', { value: 500, configurable: true });
  });

  test('tapping play fetches a random batch of the artist\'s tracks and tags queueSource', async () => {
    apiService.getRandomScopeTracks.mockResolvedValue({
      data: { tracks: [{ id: 1, title: 'Track One', url: 'http://x/1.mp3' }] },
    });
    const addTracks = vi.fn();
    const setQueueSource = vi.fn();
    usePlayerStore.setState({ addTracks, setQueueSource });

    render(<ArtistCard artist={artist} onClick={vi.fn()} imageUrl="/img/sm/x.jpg" />);
    fireEvent.click(screen.getByRole('button', { name: 'Play Test Artist' }));

    await waitFor(() => expect(addTracks).toHaveBeenCalled());
    expect(apiService.getRandomScopeTracks).toHaveBeenCalledWith('artist', 1);
    expect(setQueueSource).toHaveBeenCalledWith({ type: 'artist', id: 1 });
  });
});

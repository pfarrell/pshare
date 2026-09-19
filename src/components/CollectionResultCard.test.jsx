import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import CollectionResultCard from './CollectionResultCard';
import { useAuthStore } from '../stores/authStore';
import { useFavoritesStore } from '../stores/favoritesStore';
import { useViewModeStore } from '../stores/viewModeStore';
import { apiService } from '../services/api';
import { usePlayerStore } from '../stores/playerStore';

vi.mock('../services/api', () => ({
  apiService: {
    getRandomScopeTracks: vi.fn(),
    getImageUrl: (path) => (path ? `http://example.com/${path}` : null),
  },
}));

const collection = { id: 9, name: 'Test Collection' };

afterEach(() => {
  Object.defineProperty(window, 'innerWidth', { value: 1024, configurable: true });
});

test('renders the collection name', () => {
  render(<CollectionResultCard collection={collection} onClick={vi.fn()} imageUrl="/img/sm/x.jpg" />);
  expect(screen.getByText('Test Collection')).toBeInTheDocument();
});

test('shows the album count when present', () => {
  render(
    <CollectionResultCard
      collection={{ ...collection, album_count: 3 }}
      onClick={vi.fn()}
      imageUrl="/img/sm/x.jpg"
    />
  );
  expect(screen.getByText('3 albums')).toBeInTheDocument();
});

test('does not render an album count when album_count is absent', () => {
  render(<CollectionResultCard collection={collection} onClick={vi.fn()} imageUrl="/img/sm/x.jpg" />);
  expect(screen.queryByText(/album/)).toBeNull();
});

test('clicking the card calls onClick with the collection', () => {
  const onClick = vi.fn();
  render(<CollectionResultCard collection={collection} onClick={onClick} imageUrl="/img/sm/x.jpg" />);
  screen.getByText('Test Collection').click();
  expect(onClick).toHaveBeenCalledWith(collection);
});

describe('mobile row layout', () => {
  beforeEach(() => {
    Object.defineProperty(window, 'innerWidth', { value: 500, configurable: true });
  });

  test('shows "Collection · {N} albums" as the subtitle', () => {
    render(
      <CollectionResultCard
        collection={{ ...collection, album_count: 3 }}
        onClick={vi.fn()}
        imageUrl="/img/sm/x.jpg"
      />
    );
    expect(screen.getByText('Collection · 3 albums')).toBeInTheDocument();
  });

  test('shows just "Collection" as the subtitle when album_count is absent', () => {
    render(<CollectionResultCard collection={collection} onClick={vi.fn()} imageUrl="/img/sm/x.jpg" />);
    expect(screen.getByText('Collection')).toBeInTheDocument();
  });

  test('clicking the row calls onClick with the collection', () => {
    const onClick = vi.fn();
    render(<CollectionResultCard collection={collection} onClick={onClick} imageUrl="/img/sm/x.jpg" />);
    fireEvent.click(screen.getByText('Test Collection'));
    expect(onClick).toHaveBeenCalledWith(collection);
  });
});

describe('mobile row — cover collage', () => {
  beforeEach(() => {
    Object.defineProperty(window, 'innerWidth', { value: 500, configurable: true });
  });

  test('renders the collage when there is no custom image and 4+ preview albums are given', () => {
    render(
      <CollectionResultCard
        collection={collection}
        onClick={vi.fn()}
        imageUrl="/img/sm/x.jpg"
        previewAlbums={[
          { id: 1, image_path: 'a.jpg' },
          { id: 2, image_path: 'b.jpg' },
          { id: 3, image_path: 'c.jpg' },
          { id: 4, image_path: 'd.jpg' },
        ]}
      />
    );
    expect(screen.getByTestId('cover-collage')).toBeInTheDocument();
  });

  test('falls back to the plain imageUrl when previewAlbums is absent', () => {
    render(<CollectionResultCard collection={collection} onClick={vi.fn()} imageUrl="/img/sm/x.jpg" />);
    expect(screen.queryByTestId('cover-collage')).not.toBeInTheDocument();
    expect(screen.queryByTestId('cover-collage-single')).not.toBeInTheDocument();
  });

  test('ignores previewAlbums when the collection has a custom image', () => {
    render(
      <CollectionResultCard
        collection={{ ...collection, image_path: 'custom.jpg' }}
        onClick={vi.fn()}
        imageUrl="/img/custom.jpg"
        previewAlbums={[
          { id: 1, image_path: 'a.jpg' },
          { id: 2, image_path: 'b.jpg' },
          { id: 3, image_path: 'c.jpg' },
          { id: 4, image_path: 'd.jpg' },
        ]}
      />
    );
    expect(screen.queryByTestId('cover-collage')).not.toBeInTheDocument();
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

  test('shows "Collection · {N} albums" as the subtitle', () => {
    render(
      <CollectionResultCard
        collection={{ ...collection, album_count: 3 }}
        onClick={vi.fn()}
        imageUrl="/img/sm/x.jpg"
      />
    );
    expect(screen.getByText('Collection · 3 albums')).toBeInTheDocument();
  });

  test('clicking the row calls onClick with the collection', () => {
    const onClick = vi.fn();
    render(<CollectionResultCard collection={collection} onClick={onClick} imageUrl="/img/sm/x.jpg" />);
    fireEvent.click(screen.getByText('Test Collection'));
    expect(onClick).toHaveBeenCalledWith(collection);
  });
});

describe('CollectionResultCard — Favorite menu item', () => {
  beforeEach(() => {
    useAuthStore.setState({ isAuthenticated: false });
    useFavoritesStore.setState({ isFavorite: () => false, toggleFavorite: vi.fn() });
  });

  test('right-click does nothing when logged out', () => {
    render(<CollectionResultCard collection={collection} onClick={vi.fn()} imageUrl="/img/sm/x.jpg" />);
    fireEvent.contextMenu(screen.getByText('Test Collection').closest('.artist-card'));
    expect(screen.queryByText(/Favorites/)).not.toBeInTheDocument();
  });

  test('right-click shows the Favorite item when logged in', () => {
    useAuthStore.setState({ isAuthenticated: true });
    render(<CollectionResultCard collection={collection} onClick={vi.fn()} imageUrl="/img/sm/x.jpg" />);
    fireEvent.contextMenu(screen.getByText('Test Collection').closest('.artist-card'));
    expect(screen.getByText('☆ Add to Favorites')).toBeInTheDocument();
  });

  test('clicking it calls toggleFavorite with the collection kind/id', () => {
    useAuthStore.setState({ isAuthenticated: true });
    const toggleFavorite = vi.fn();
    useFavoritesStore.setState({ isFavorite: () => false, toggleFavorite });
    render(<CollectionResultCard collection={collection} onClick={vi.fn()} imageUrl="/img/sm/x.jpg" />);
    fireEvent.contextMenu(screen.getByText('Test Collection').closest('.artist-card'));

    fireEvent.click(screen.getByText('☆ Add to Favorites'));

    expect(toggleFavorite).toHaveBeenCalledWith('collection', collection.id, expect.objectContaining({ id: collection.id, name: collection.name }));
  });
});

describe('play button', () => {
  beforeEach(() => {
    Object.defineProperty(window, 'innerWidth', { value: 500, configurable: true });
  });

  test('tapping play fetches a random batch of the collection\'s tracks and tags queueSource', async () => {
    apiService.getRandomScopeTracks.mockResolvedValue({
      data: { tracks: [{ id: 1, title: 'Track One', url: 'http://x/1.mp3' }] },
    });
    const addTracks = vi.fn();
    const setQueueSource = vi.fn();
    usePlayerStore.setState({ addTracks, setQueueSource });

    render(<CollectionResultCard collection={collection} onClick={vi.fn()} imageUrl="/img/sm/x.jpg" />);
    fireEvent.click(screen.getByRole('button', { name: 'Play Test Collection' }));

    await waitFor(() => expect(addTracks).toHaveBeenCalled());
    expect(apiService.getRandomScopeTracks).toHaveBeenCalledWith('collection', 9);
    expect(setQueueSource).toHaveBeenCalledWith({ type: 'collection', id: 9 });
  });
});

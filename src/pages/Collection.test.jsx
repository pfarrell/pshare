import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import Collection from './Collection';
import { apiService } from '../services/api';
import { useAuthStore } from '../stores/authStore';
import { useFavoritesStore } from '../stores/favoritesStore';
import { usePlayerStore } from '../stores/playerStore';

vi.mock('../components/NotesSection', () => ({ default: () => null }));
vi.mock('../components/AlbumCard', () => ({ default: ({ album }) => <div>{album.title}</div> }));
vi.mock('../services/api', () => ({
  apiService: {
    getCollection: vi.fn(),
    getImageUrl: (path) => (path ? `http://example.com/${path}` : null),
    getRandomScopeTracks: vi.fn(),
  },
}));

const baseCollection = { id: 3, name: 'Road Trip Mix', image_path: null, user_id: null };

const renderCollection = () =>
  render(
    <MemoryRouter initialEntries={['/collection/3']}>
      <Routes>
        <Route path="/collection/:id" element={<Collection />} />
      </Routes>
    </MemoryRouter>
  );

beforeEach(() => {
  vi.clearAllMocks();
  useAuthStore.setState({ isAdmin: false, isAuthenticated: false, user: null });
  useFavoritesStore.setState({ isFavorite: () => false, toggleFavorite: vi.fn() });
  usePlayerStore.setState({ addTracks: vi.fn(), setQueueSource: vi.fn() });
  apiService.getRandomScopeTracks.mockResolvedValue({ data: { tracks: [] } });
});

describe('Collection page — wikipedia summary', () => {
  test('renders the summary when present', async () => {
    apiService.getCollection.mockResolvedValue({
      data: {
        collection: baseCollection,
        albums: [],
        notes: [],
        summary: { summary: 'A famous mix tape.', url: 'https://en.wikipedia.org/wiki/Kind_of_Blue' },
      },
    });
    renderCollection();
    expect(await screen.findByText(/A famous mix tape\./)).toBeInTheDocument();
  });

  test('renders nothing extra when summary is null', async () => {
    apiService.getCollection.mockResolvedValue({
      data: { collection: baseCollection, albums: [], notes: [], summary: null },
    });
    renderCollection();
    await screen.findByText('Road Trip Mix');
    expect(screen.queryByText(/\.\.\.more at wikipedia/)).not.toBeInTheDocument();
  });
});

describe('Collection page — stubs', () => {
  test('renders stub entries with a dashed border alongside real albums', async () => {
    apiService.getCollection.mockResolvedValue({
      data: {
        collection: baseCollection,
        albums: [
          { id: 1, title: 'A', image_path: 'a.jpg', order: 1, artist: { id: 1, name: 'Artist A' } },
        ],
        stubs: [
          { id: 1, title: 'Missing Album', artist_name: 'Missing Artist', order: 2 },
        ],
        notes: [],
        summary: null,
      },
    });
    renderCollection();
    expect(await screen.findByText('Missing Album')).toBeInTheDocument();
    expect(screen.getByText('Missing Artist')).toBeInTheDocument();
  });
});

describe('Collection page — Shuffle All', () => {
  test('shows no Play button when the collection has no albums', async () => {
    apiService.getCollection.mockResolvedValue({
      data: { collection: baseCollection, albums: [], notes: [], summary: null },
    });
    renderCollection();
    await screen.findByText('Road Trip Mix');
    expect(screen.queryByRole('button', { name: 'Play' })).not.toBeInTheDocument();
  });

  test('shows a Play button that fetches a random batch of the collection\'s tracks when the collection has albums', async () => {
    apiService.getCollection.mockResolvedValue({
      data: {
        collection: baseCollection,
        albums: [{ id: 1, title: 'A', image_path: 'a.jpg', order: 1, artist: { id: 1, name: 'Artist A' } }],
        notes: [],
        summary: null,
      },
    });
    apiService.getRandomScopeTracks.mockResolvedValue({
      data: { tracks: [{ id: 100, title: 'Random Track', url: '/stream/100' }] },
    });
    renderCollection();
    await screen.findByText('A');

    fireEvent.click(screen.getByRole('button', { name: 'Play' }));

    await waitFor(() => {
      expect(apiService.getRandomScopeTracks).toHaveBeenCalledWith('collection', baseCollection.id);
      expect(usePlayerStore.getState().addTracks).toHaveBeenCalledWith(
        [{ id: 100, title: 'Random Track', url: '/stream/100' }],
        false,
        { flashActivity: true, playImmediately: true }
      );
      expect(usePlayerStore.getState().setQueueSource).toHaveBeenCalledWith({ type: 'collection', id: baseCollection.id });
    });
  });
});

describe('Collection page — Edit button access', () => {
  test('shows Edit in the overflow menu for a non-admin user who owns the collection', async () => {
    useAuthStore.setState({ isAdmin: false, user: { id: 7 }, isAuthenticated: true });
    apiService.getCollection.mockResolvedValue({
      data: { collection: { ...baseCollection, user_id: 7 }, albums: [], notes: [], summary: null },
    });
    renderCollection();
    await screen.findByText('Road Trip Mix');

    fireEvent.click(screen.getByRole('button', { name: 'More options' }));

    expect(screen.getByText('✎ Edit')).toBeInTheDocument();
  });

  test('hides Edit from the overflow menu for a non-admin user who does not own the collection', async () => {
    useAuthStore.setState({ isAdmin: false, user: { id: 999 }, isAuthenticated: true });
    apiService.getCollection.mockResolvedValue({
      data: { collection: { ...baseCollection, user_id: 7 }, albums: [], notes: [], summary: null },
    });
    renderCollection();
    await screen.findByText('Road Trip Mix');

    fireEvent.click(screen.getByRole('button', { name: 'More options' }));

    expect(screen.queryByText('✎ Edit')).not.toBeInTheDocument();
  });
});

describe('Collection page — header context menu', () => {
  beforeEach(() => {
    apiService.getCollection.mockResolvedValue({
      data: { collection: baseCollection, albums: [], notes: [], summary: null },
    });
  });

  test('right-clicking the header shows Favorite when authenticated', async () => {
    useAuthStore.setState({ isAdmin: false, isAuthenticated: true, user: null });
    renderCollection();
    await screen.findByText('Road Trip Mix');

    fireEvent.contextMenu(screen.getByText('Road Trip Mix').closest('div'));

    expect(screen.getByText('☆ Add to Favorites')).toBeInTheDocument();
  });

  test('shows nothing on right-click when logged out', async () => {
    renderCollection();
    await screen.findByText('Road Trip Mix');

    fireEvent.contextMenu(screen.getByText('Road Trip Mix').closest('div'));

    expect(screen.queryByText(/Favorites/)).not.toBeInTheDocument();
    expect(screen.queryByText('📤 Share')).not.toBeInTheDocument();
  });

  test('Edit shows for the collection owner', async () => {
    useAuthStore.setState({ isAdmin: false, user: { id: 7 }, isAuthenticated: true });
    apiService.getCollection.mockResolvedValue({
      data: { collection: { ...baseCollection, user_id: 7 }, albums: [], notes: [], summary: null },
    });
    renderCollection();
    await screen.findByText('Road Trip Mix');

    fireEvent.contextMenu(screen.getByText('Road Trip Mix').closest('div'));

    expect(screen.getByText('✎ Edit')).toBeInTheDocument();
  });

  test('Edit is absent for a non-owner, non-admin', async () => {
    useAuthStore.setState({ isAdmin: false, user: { id: 999 }, isAuthenticated: true });
    apiService.getCollection.mockResolvedValue({
      data: { collection: { ...baseCollection, user_id: 7 }, albums: [], notes: [], summary: null },
    });
    renderCollection();
    await screen.findByText('Road Trip Mix');

    fireEvent.contextMenu(screen.getByText('Road Trip Mix').closest('div'));

    expect(screen.queryByText('✎ Edit')).not.toBeInTheDocument();
  });

  test('Share shows only when authenticated', async () => {
    useAuthStore.setState({ isAdmin: false, isAuthenticated: true, user: null });
    renderCollection();
    await screen.findByText('Road Trip Mix');

    fireEvent.contextMenu(screen.getByText('Road Trip Mix').closest('div'));

    expect(screen.getByText('📤 Share')).toBeInTheDocument();
  });
});

describe('Collection page — cover collage', () => {
  test('shows a 2x2 collage of the first 4 albums with covers when there is no custom image', async () => {
    apiService.getCollection.mockResolvedValue({
      data: {
        collection: baseCollection,
        albums: [
          { id: 1, title: 'A', image_path: 'a.jpg', artist: { id: 1, name: 'Artist A' } },
          { id: 2, title: 'B', image_path: 'b.jpg', artist: { id: 2, name: 'Artist B' } },
          { id: 3, title: 'C', image_path: null, artist: { id: 3, name: 'Artist C' } },
          { id: 4, title: 'D', image_path: 'd.jpg', artist: { id: 4, name: 'Artist D' } },
          { id: 5, title: 'E', image_path: 'e.jpg', artist: { id: 5, name: 'Artist E' } },
        ],
        notes: [],
        summary: null,
      },
    });
    renderCollection();
    await screen.findByText('Road Trip Mix');

    const collage = screen.getByTestId('cover-collage');
    const tiles = collage.querySelectorAll('img');
    expect(tiles).toHaveLength(4);
    expect(tiles[0]).toHaveAttribute('src', 'http://example.com/a.jpg');
    expect(tiles[1]).toHaveAttribute('src', 'http://example.com/b.jpg');
    expect(tiles[2]).toHaveAttribute('src', 'http://example.com/d.jpg');
    expect(tiles[3]).toHaveAttribute('src', 'http://example.com/e.jpg');
  });

  test('shows a single cover when 1-3 albums have images', async () => {
    apiService.getCollection.mockResolvedValue({
      data: {
        collection: baseCollection,
        albums: [
          { id: 1, title: 'A', image_path: 'a.jpg', artist: { id: 1, name: 'Artist A' } },
          { id: 2, title: 'B', image_path: null, artist: { id: 2, name: 'Artist B' } },
        ],
        notes: [],
        summary: null,
      },
    });
    renderCollection();
    await screen.findByText('Road Trip Mix');

    expect(screen.queryByTestId('cover-collage')).not.toBeInTheDocument();
    const cover = screen.getByTestId('cover-collage-single');
    expect(cover).toHaveAttribute('src', 'http://example.com/a.jpg');
  });

  test('shows the placeholder when no album has an image', async () => {
    apiService.getCollection.mockResolvedValue({
      data: {
        collection: baseCollection,
        albums: [{ id: 1, title: 'A', image_path: null, artist: { id: 1, name: 'Artist A' } }],
        notes: [],
        summary: null,
      },
    });
    renderCollection();
    await screen.findByText('Road Trip Mix');

    expect(screen.queryByTestId('cover-collage')).not.toBeInTheDocument();
    expect(screen.queryByTestId('cover-collage-single')).not.toBeInTheDocument();
    expect(screen.getByText('▣')).toBeInTheDocument();
  });

  test('shows the custom image instead of the collage when image_path is set, and it stays clickable', async () => {
    apiService.getCollection.mockResolvedValue({
      data: {
        collection: { ...baseCollection, image_path: 'cover.jpg' },
        albums: [
          { id: 1, title: 'A', image_path: 'a.jpg', artist: { id: 1, name: 'Artist A' } },
          { id: 2, title: 'B', image_path: 'b.jpg', artist: { id: 2, name: 'Artist B' } },
          { id: 3, title: 'C', image_path: 'c.jpg', artist: { id: 3, name: 'Artist C' } },
          { id: 4, title: 'D', image_path: 'd.jpg', artist: { id: 4, name: 'Artist D' } },
          { id: 5, title: 'E', image_path: 'e.jpg', artist: { id: 5, name: 'Artist E' } },
        ],
        notes: [],
        summary: null,
      },
    });
    renderCollection();
    await screen.findByText('Road Trip Mix');

    expect(screen.queryByTestId('cover-collage')).not.toBeInTheDocument();
    expect(screen.queryByTestId('cover-collage-single')).not.toBeInTheDocument();

    const img = screen.getByAltText('Road Trip Mix');
    expect(img).toHaveAttribute('src', 'http://example.com/cover.jpg');
    expect(img.style.cursor).toBe('zoom-in');
  });
});

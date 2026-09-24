import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import Album from './Album';
import { usePlayerStore } from '../stores/playerStore';
import { useAuthStore } from '../stores/authStore';
import { useFavoritesStore } from '../stores/favoritesStore';
import { apiService } from '../services/api';

// jsdom doesn't implement scrollIntoView at all.
Element.prototype.scrollIntoView = vi.fn();

vi.mock('../components/TagsSection', () => ({ default: () => null }));
vi.mock('../components/NotesSection', () => ({ default: () => null }));
vi.mock('../components/AddToCollectionModal', () => ({ default: () => null }));
vi.mock('../services/api', () => ({
  apiService: {
    getAlbum: vi.fn(),
    getAdjacentAlbums: vi.fn(),
    getImageUrl: () => 'http://example.com/image.jpg',
    makeTrackSingle: vi.fn(),
  },
}));

const albumData = {
  artist: { id: 5, name: 'Album Artist' },
  album: { id: 10, title: 'Test Album', image_path: 'a.jpg' },
  tracks: [
    { id: 1, title: 'Track One', duration: 180, artist: { id: 5, name: 'Album Artist' }, album: { id: 10, title: 'Test Album', artist: { id: 5, name: 'Album Artist' } } },
    { id: 2, title: 'Track Two', duration: 200, artist: { id: 5, name: 'Album Artist' }, album: { id: 10, title: 'Test Album', artist: { id: 5, name: 'Album Artist' } } },
  ],
  summary: {},
  secondary_artists: [],
};

const renderAlbum = (initialEntries = ['/album/10']) =>
  render(
    <MemoryRouter initialEntries={initialEntries}>
      <Routes>
        <Route path="/album/:id" element={<Album />} />
      </Routes>
    </MemoryRouter>
  );

beforeEach(() => {
  apiService.getAlbum.mockResolvedValue({ data: albumData });
  apiService.getAdjacentAlbums.mockResolvedValue({ data: { prev: null, next: null } });
  useAuthStore.setState({ isAdmin: false, isAuthenticated: true });
  useFavoritesStore.setState({ isFavorite: () => false, toggleFavorite: vi.fn() });
  Element.prototype.scrollIntoView.mockClear();
});

describe('Album page — scrolling to the track that arrived playing (from the mobile now-playing tap)', () => {
  test('scrolls the matching track into view when navigated here with scrollToTrackId state', async () => {
    renderAlbum([{ pathname: '/album/10', state: { scrollToTrackId: 2 } }]);
    await screen.findByText('Test Album');

    expect(Element.prototype.scrollIntoView).toHaveBeenCalledWith(
      // 'start' so the row lands below the fixed header, matching the
      // .scroll-below-fixed-header convention used elsewhere (AdminCollection).
      expect.objectContaining({ block: 'start' })
    );
  });

  test('does not scroll when there is no scrollToTrackId in location state', async () => {
    renderAlbum();
    await screen.findByText('Test Album');

    expect(Element.prototype.scrollIntoView).not.toHaveBeenCalled();
  });

  test('does not scroll when scrollToTrackId does not match any track on this album', async () => {
    renderAlbum([{ pathname: '/album/10', state: { scrollToTrackId: 999 } }]);
    await screen.findByText('Test Album');

    expect(Element.prototype.scrollIntoView).not.toHaveBeenCalled();
  });
});

describe('Album page — Overtone menu item', () => {
  test('shows Overtone in the overflow menu when the album has a musicbrainz_id', async () => {
    apiService.getAlbum.mockResolvedValue({
      data: { ...albumData, album: { ...albumData.album, musicbrainz_id: 'xyz-789' } },
    });
    renderAlbum();
    await screen.findByText('Test Album');

    fireEvent.click(screen.getByRole('button', { name: 'More options' }));

    expect(screen.getByRole('button', { name: '🔍 Overtone' })).toBeInTheDocument();
  });

  test('does not show Overtone in the overflow menu when the album has no musicbrainz_id', async () => {
    renderAlbum();
    await screen.findByText('Test Album');

    fireEvent.click(screen.getByRole('button', { name: 'More options' }));

    expect(screen.queryByRole('button', { name: '🔍 Overtone' })).not.toBeInTheDocument();
  });

  test('clicking Overtone opens it in a modal instead of navigating', async () => {
    apiService.getAlbum.mockResolvedValue({
      data: { ...albumData, album: { ...albumData.album, musicbrainz_id: 'xyz-789' } },
    });
    renderAlbum();
    await screen.findByText('Test Album');

    fireEvent.click(screen.getByRole('button', { name: 'More options' }));
    fireEvent.click(screen.getByRole('button', { name: '🔍 Overtone' }));

    expect(screen.getByTitle('Overtone')).toHaveAttribute('src', 'https://patf.com/overtone/release/xyz-789');
  });
});

describe('Album page', () => {
  test('Add to Queue calls addTracks with flashActivity', async () => {
    const addTracks = vi.fn();
    usePlayerStore.setState({ addTracks, currentTrack: null });

    renderAlbum();
    await screen.findByText('Test Album');

    fireEvent.click(screen.getByRole('button', { name: 'More options' }));
    fireEvent.click(screen.getByText('➕ Add to Queue'));

    expect(addTracks).toHaveBeenCalledWith(albumData.tracks, false, { flashActivity: true });
  });

  test('the default Play button appends to the queue, jumps to it, and does not clear the existing queue', async () => {
    const addTracks = vi.fn();
    usePlayerStore.setState({ addTracks, currentTrack: null });

    renderAlbum();
    await screen.findByText('Test Album');

    fireEvent.click(screen.getByRole('button', { name: 'Play' }));

    expect(addTracks).toHaveBeenCalledWith(albumData.tracks, false, { flashActivity: true, playImmediately: true });
  });

  test('registers the album tracks as pageTracks once loaded, so the footer play button can fall back to them', async () => {
    renderAlbum();
    await screen.findByText('Test Album');

    expect(usePlayerStore.getState().pageTracks).toEqual(albumData.tracks);
  });

  test('clears pageTracks on unmount so a stale album cannot be played from elsewhere', async () => {
    const { unmount } = renderAlbum();
    await screen.findByText('Test Album');

    unmount();

    expect(usePlayerStore.getState().pageTracks).toEqual([]);
  });
});

describe('Album page — queueSource', () => {
  test('Play tags queueSource with this album, whether or not it was opened from a collection', async () => {
    const addTracks = vi.fn();
    const setQueueSource = vi.fn();
    usePlayerStore.setState({ addTracks, setQueueSource, currentTrack: null });

    renderAlbum([{ pathname: '/album/10', state: { collectionId: 7 } }]);
    await screen.findByText('Test Album');

    fireEvent.click(screen.getByRole('button', { name: 'Play' }));

    expect(setQueueSource).toHaveBeenCalledWith({ type: 'album', id: 10 });
  });

  test('Play tags queueSource the same way when opened outside a collection', async () => {
    const addTracks = vi.fn();
    const setQueueSource = vi.fn();
    usePlayerStore.setState({ addTracks, setQueueSource, currentTrack: null });

    renderAlbum();
    await screen.findByText('Test Album');

    fireEvent.click(screen.getByRole('button', { name: 'Play' }));

    expect(setQueueSource).toHaveBeenCalledWith({ type: 'album', id: 10 });
  });
});

describe('Album page — compilation secondary-artist suppression', () => {
  const baseData = {
    artist: { id: 5, name: 'Album Artist' },
    tracks: albumData.tracks,
    summary: {},
    secondary_artists: [{ id: 8, name: 'Featured Artist', role: 'featured' }],
  };

  test('shows "Also featuring" when album is not a compilation', async () => {
    apiService.getAlbum.mockResolvedValue({
      data: { ...baseData, album: { id: 10, title: 'Test Album', image_path: 'a.jpg', is_compilation: false } },
    });
    renderAlbum();
    await screen.findByText('Test Album');
    expect(screen.getByText(/Also featuring/)).toBeInTheDocument();
  });

  test('hides "Also featuring" when album is a compilation with no other credited artists', async () => {
    apiService.getAlbum.mockResolvedValue({
      data: { ...baseData, album: { id: 10, title: 'Test Album', image_path: 'a.jpg', is_compilation: true }, compilation_artists: [] },
    });
    renderAlbum();
    await screen.findByText('Test Album');
    expect(screen.queryByText(/Also featuring/)).not.toBeInTheDocument();
  });

  test('shows "Featuring" (not "Also featuring") with track-level artists when album is a compilation', async () => {
    apiService.getAlbum.mockResolvedValue({
      data: {
        ...baseData,
        album: { id: 10, title: 'Test Album', image_path: 'a.jpg', is_compilation: true },
        compilation_artists: [{ id: 200, name: 'Steppenwolf' }, { id: 201, name: 'The Byrds' }],
      },
    });
    renderAlbum();
    await screen.findByText('Test Album');
    expect(screen.getByText('Featuring:')).toBeInTheDocument();
    expect(screen.queryByText(/Also featuring/)).not.toBeInTheDocument();
    expect(screen.getByText('Steppenwolf')).toBeInTheDocument();
    expect(screen.getByText('The Byrds')).toBeInTheDocument();
  });
});

describe('Album page — compilation artist heading', () => {
  test('keeps the album\'s own artist (e.g. Various Artists) as the heading for a compilation album', async () => {
    apiService.getAlbum.mockResolvedValue({
      data: {
        ...albumData,
        album: { ...albumData.album, is_compilation: true },
        compilation_artists: [{ id: 200, name: 'Steppenwolf' }, { id: 201, name: 'The Byrds' }],
      },
    });
    renderAlbum();
    await screen.findByText('Test Album');
    expect(screen.getByText('Album Artist')).toBeInTheDocument();
    expect(screen.getByText('Steppenwolf')).toBeInTheDocument();
    expect(screen.getByText('The Byrds')).toBeInTheDocument();
  });

  test('renders the normal artist heading for a non-compilation album', async () => {
    apiService.getAlbum.mockResolvedValue({ data: albumData });
    renderAlbum();
    await screen.findByText('Test Album');
    expect(screen.getByText('Album Artist')).toBeInTheDocument();
  });
});

describe('Album page — collaborators in the artist heading', () => {
  test('lists collaborator-role artists alongside the primary artist in the heading, not in "Also featuring"', async () => {
    apiService.getAlbum.mockResolvedValue({
      data: {
        artist: { id: 5, name: 'Elton John' },
        album: { id: 10, title: 'Test Album', image_path: 'a.jpg', is_compilation: false },
        tracks: albumData.tracks,
        summary: {},
        secondary_artists: [{ id: 9, name: 'Leon Russell', role: 'collaborator' }],
      },
    });
    renderAlbum();
    await screen.findByText('Test Album');
    expect(screen.getByText('Elton John')).toBeInTheDocument();
    expect(screen.getByText('Leon Russell')).toBeInTheDocument();
    expect(screen.queryByText(/Also featuring/)).not.toBeInTheDocument();
  });
});

describe('Album page — collection links', () => {
  test('shows a link for each collection the album belongs to', async () => {
    apiService.getAlbum.mockResolvedValue({
      data: {
        ...albumData,
        collections: [
          { id: 3, name: 'Road Trip Mix' },
          { id: 7, name: 'Desert Island Discs' },
        ],
      },
    });
    renderAlbum();
    await screen.findByText('Test Album');

    expect(screen.getByText('Road Trip Mix')).toBeInTheDocument();
    expect(screen.getByText('Desert Island Discs')).toBeInTheDocument();
  });

  test('navigates to the collection page when a collection link is clicked', async () => {
    apiService.getAlbum.mockResolvedValue({
      data: { ...albumData, collections: [{ id: 3, name: 'Road Trip Mix' }] },
    });
    render(
      <MemoryRouter initialEntries={['/album/10']}>
        <Routes>
          <Route path="/album/:id" element={<Album />} />
          <Route path="/collection/:id" element={<div>Collection Page</div>} />
        </Routes>
      </MemoryRouter>
    );
    await screen.findByText('Test Album');

    fireEvent.click(screen.getByText('Road Trip Mix'));

    expect(await screen.findByText('Collection Page')).toBeInTheDocument();
  });

  test('renders nothing when the album has no collections', async () => {
    apiService.getAlbum.mockResolvedValue({ data: { ...albumData, collections: [] } });
    renderAlbum();
    await screen.findByText('Test Album');

    expect(screen.queryByText(/In collections/)).not.toBeInTheDocument();
  });

  test('renders nothing when collections is omitted entirely', async () => {
    apiService.getAlbum.mockResolvedValue({ data: albumData });
    renderAlbum();
    await screen.findByText('Test Album');

    expect(screen.queryByText(/In collections/)).not.toBeInTheDocument();
  });
});

describe('Album page — header context menu', () => {
  test('right-clicking the header shows Add to Collection and Favorite', async () => {
    renderAlbum();
    await screen.findByText('Test Album');

    fireEvent.contextMenu(screen.getByText('Test Album').closest('.media-page-header'));

    expect(screen.getByText('▣ Add to Collection')).toBeInTheDocument();
    expect(screen.getByText('☆ Add to Favorites')).toBeInTheDocument();
  });

  test('shows neither Add to Collection nor Favorite when logged out', async () => {
    useAuthStore.setState({ isAdmin: false, isAuthenticated: false });
    renderAlbum();
    await screen.findByText('Test Album');

    fireEvent.contextMenu(screen.getByText('Test Album').closest('.media-page-header'));

    expect(screen.queryByText('▣ Add to Collection')).not.toBeInTheDocument();
    expect(screen.queryByText(/Favorites/)).not.toBeInTheDocument();
  });

  test('does not open the menu backdrop at all when logged out and there is no musicbrainz_id (nothing in it would show)', async () => {
    useAuthStore.setState({ isAdmin: false, isAuthenticated: false });
    renderAlbum();
    await screen.findByText('Test Album');

    fireEvent.contextMenu(screen.getByText('Test Album').closest('.media-page-header'));

    expect(screen.queryByTestId('album-header-menu-backdrop')).not.toBeInTheDocument();
  });

  test('still opens when logged out if the album has a musicbrainz_id (Overtone needs no account)', async () => {
    useAuthStore.setState({ isAdmin: false, isAuthenticated: false });
    apiService.getAlbum.mockResolvedValue({
      data: { ...albumData, album: { ...albumData.album, musicbrainz_id: 'xyz-789' } },
    });
    renderAlbum();
    await screen.findByText('Test Album');

    fireEvent.contextMenu(screen.getByText('Test Album').closest('.media-page-header'));

    expect(screen.getByTestId('album-header-menu-backdrop')).toBeInTheDocument();
    expect(screen.getByText('🔍 Overtone')).toBeInTheDocument();
    expect(screen.queryByText('▣ Add to Collection')).not.toBeInTheDocument();
    expect(screen.queryByText('📤 Share')).not.toBeInTheDocument();
  });

  test('clicking Favorite calls toggleFavorite with the album kind/id', async () => {
    const toggleFavorite = vi.fn();
    useFavoritesStore.setState({ isFavorite: () => false, toggleFavorite });
    renderAlbum();
    await screen.findByText('Test Album');

    fireEvent.contextMenu(screen.getByText('Test Album').closest('.media-page-header'));
    fireEvent.click(screen.getByText('☆ Add to Favorites'));

    expect(toggleFavorite).toHaveBeenCalledWith('album', albumData.album.id, expect.objectContaining({ id: albumData.album.id, title: albumData.album.title }));
  });

  test('Edit shows only for admins', async () => {
    useAuthStore.setState({ isAdmin: true, isAuthenticated: true });
    renderAlbum();
    await screen.findByText('Test Album');

    fireEvent.contextMenu(screen.getByText('Test Album').closest('.media-page-header'));

    expect(screen.getByText('✎ Edit')).toBeInTheDocument();
  });

  test('Edit is absent for a non-admin', async () => {
    useAuthStore.setState({ isAdmin: false, isAuthenticated: true });
    renderAlbum();
    await screen.findByText('Test Album');

    fireEvent.contextMenu(screen.getByText('Test Album').closest('.media-page-header'));

    expect(screen.queryByText('✎ Edit')).not.toBeInTheDocument();
  });

  test('Share shows only when authenticated', async () => {
    useAuthStore.setState({ isAdmin: false, isAuthenticated: true });
    renderAlbum();
    await screen.findByText('Test Album');

    fireEvent.contextMenu(screen.getByText('Test Album').closest('.media-page-header'));

    expect(screen.getByText('📤 Share')).toBeInTheDocument();
  });
});

describe('Album page — Make Single', () => {
  test('does not show the Make Single menu item for non-admins', async () => {
    useAuthStore.setState({ isAdmin: false, isAuthenticated: true });
    renderAlbum();
    await screen.findByText('Test Album');

    fireEvent.contextMenu(screen.getByText(/Track One/).closest('.track-item'));

    expect(screen.queryByText(/Make Single/)).not.toBeInTheDocument();
  });

  test('shows the Make Single menu item for admins and removes the track from the list on success', async () => {
    useAuthStore.setState({ isAdmin: true, isAuthenticated: true });
    window.confirm = vi.fn(() => true);
    apiService.makeTrackSingle.mockResolvedValue({ data: {} });
    renderAlbum();
    await screen.findByText('Test Album');

    fireEvent.contextMenu(screen.getByText(/Track One/).closest('.track-item'));
    expect(screen.getByText('🎵 Make Single')).toBeInTheDocument();
    fireEvent.click(screen.getByText('🎵 Make Single'));

    await waitFor(() => expect(screen.queryByText(/Track One/)).not.toBeInTheDocument());
    expect(screen.getByText(/Track Two/)).toBeInTheDocument();
  });
});

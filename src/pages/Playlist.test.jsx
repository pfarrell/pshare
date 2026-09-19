import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import Playlist from './Playlist';
import { usePlayerStore } from '../stores/playerStore';
import { useAuthStore } from '../stores/authStore';
import { useFavoritesStore } from '../stores/favoritesStore';
import { apiService } from '../services/api';

vi.mock('../services/api', () => ({
  apiService: {
    getPlaylist: vi.fn(),
    getImageUrl: vi.fn(() => 'http://example.com/image.jpg'),
  },
}));

const playlistData = {
  playlist: { id: 20, name: 'Test Playlist', user_id: 1 },
  tracks: [
    { id: 1, title: 'Track One', duration: 180, artist: { name: 'Some Artist' } },
    { id: 2, title: 'Track Two', duration: 200, artist: { name: 'Some Artist' } },
  ],
};

const renderPlaylist = () =>
  render(
    <MemoryRouter initialEntries={['/playlist/20']}>
      <Routes>
        <Route path="/playlist/:id" element={<Playlist />} />
      </Routes>
    </MemoryRouter>
  );

beforeEach(() => {
  apiService.getPlaylist.mockResolvedValue({ data: playlistData });
  useAuthStore.setState({ isAdmin: false, user: null, isAuthenticated: true });
  useFavoritesStore.setState({ isFavorite: () => false, toggleFavorite: vi.fn() });
});

describe('Playlist page', () => {
  const withSourcePlaylist = playlistData.tracks.map((t) => ({
    ...t,
    source_playlist: { id: playlistData.playlist.id, name: playlistData.playlist.name },
  }));

  test('the default Play button appends to the queue, jumps to it, and does not clear the existing queue', async () => {
    const addTracks = vi.fn();
    const setQueueSource = vi.fn();
    usePlayerStore.setState({ addTracks, setQueueSource });
    renderPlaylist();
    await screen.findByText('Test Playlist');

    fireEvent.click(screen.getByRole('button', { name: 'Play' }));

    expect(addTracks).toHaveBeenCalledWith(withSourcePlaylist, false, { flashActivity: true, playImmediately: true });
    expect(setQueueSource).toHaveBeenCalledWith({ type: 'playlist', id: playlistData.playlist.id });
  });

  test('registers the playlist tracks as pageTracks once loaded, so the footer play button can fall back to them', async () => {
    renderPlaylist();
    await screen.findByText('Test Playlist');

    // The name-render and the pageTracks-setting effect are two separate renders
    // (playlistData lands first, the passive effect that calls setPageTracks follows
    // asynchronously after paint) — waitFor avoids a race where this assertion runs
    // before that effect has flushed, most visible under heavy parallel test load.
    await waitFor(() => {
      expect(usePlayerStore.getState().pageTracks).toHaveLength(playlistData.tracks.length);
      expect(usePlayerStore.getState().pageTracks[0]).toMatchObject({ id: 1, title: 'Track One' });
    });
  });

  test('tags each loaded track with source_playlist matching this playlist', async () => {
    renderPlaylist();
    await screen.findByText('Test Playlist');

    await waitFor(() => {
      expect(usePlayerStore.getState().pageTracks).toEqual([
        { ...playlistData.tracks[0], source_playlist: { id: 20, name: 'Test Playlist' } },
        { ...playlistData.tracks[1], source_playlist: { id: 20, name: 'Test Playlist' } },
      ]);
    });
  });

  test('clears pageTracks on unmount so a stale playlist cannot be played from elsewhere', async () => {
    const { unmount } = renderPlaylist();
    await screen.findByText('Test Playlist');

    unmount();

    expect(usePlayerStore.getState().pageTracks).toEqual([]);
  });
});

describe('Playlist page — cover collage', () => {
  beforeEach(() => {
    apiService.getImageUrl.mockImplementation((path, context) => (path ? `http://example.com/${context}/${path}` : null));
  });

  test('shows a 2x2 collage of the first 4 distinct albums with covers, deduping repeated albums', async () => {
    apiService.getPlaylist.mockResolvedValue({
      data: {
        playlist: { id: 20, name: 'Test Playlist', user_id: 1 },
        tracks: [
          { id: 1, title: 'A1', duration: 100, album: { id: 1, title: 'Album 1', artist: { id: 900, name: 'X' } }, artist: { name: 'X' }, image_path: 'a.jpg' },
          { id: 2, title: 'A2', duration: 100, album: { id: 1, title: 'Album 1', artist: { id: 900, name: 'X' } }, artist: { name: 'X' }, image_path: 'a.jpg' },
          { id: 3, title: 'B1', duration: 100, album: { id: 2, title: 'Album 2', artist: { id: 900, name: 'X' } }, artist: { name: 'X' }, image_path: 'b.jpg' },
          { id: 4, title: 'C1', duration: 100, album: { id: 3, title: 'Album 3', artist: { id: 900, name: 'X' } }, artist: { name: 'X' }, image_path: null },
          { id: 5, title: 'D1', duration: 100, album: { id: 4, title: 'Album 4', artist: { id: 900, name: 'X' } }, artist: { name: 'X' }, image_path: 'd.jpg' },
          { id: 6, title: 'E1', duration: 100, album: { id: 5, title: 'Album 5', artist: { id: 900, name: 'X' } }, artist: { name: 'X' }, image_path: 'e.jpg' },
        ],
      },
    });
    renderPlaylist();
    await screen.findByText('Test Playlist');

    const collage = screen.getByTestId('cover-collage');
    const tiles = collage.querySelectorAll('img');
    expect(tiles).toHaveLength(4);
    expect(tiles[0]).toHaveAttribute('src', 'http://example.com/album_small/a.jpg');
    expect(tiles[1]).toHaveAttribute('src', 'http://example.com/album_small/b.jpg');
    expect(tiles[2]).toHaveAttribute('src', 'http://example.com/album_small/d.jpg');
    expect(tiles[3]).toHaveAttribute('src', 'http://example.com/album_small/e.jpg');
  });

  test('shows a single cover when 1-3 distinct albums have images', async () => {
    apiService.getPlaylist.mockResolvedValue({
      data: {
        playlist: { id: 20, name: 'Test Playlist', user_id: 1 },
        tracks: [
          { id: 1, title: 'A1', duration: 100, album: { id: 1, title: 'Album 1', artist: { id: 900, name: 'X' } }, artist: { name: 'X' }, image_path: 'a.jpg' },
          { id: 2, title: 'A2', duration: 100, album: { id: 1, title: 'Album 1', artist: { id: 900, name: 'X' } }, artist: { name: 'X' }, image_path: 'a.jpg' },
        ],
      },
    });
    renderPlaylist();
    await screen.findByText('Test Playlist');

    expect(screen.queryByTestId('cover-collage')).not.toBeInTheDocument();
    const cover = screen.getByTestId('cover-collage-single');
    expect(cover).toHaveAttribute('src', 'http://example.com/album_small/a.jpg');
  });

  test('shows the ♪ placeholder when no track has an album cover', async () => {
    renderPlaylist();
    await screen.findByText('Test Playlist');

    expect(screen.queryByTestId('cover-collage')).not.toBeInTheDocument();
    expect(screen.queryByTestId('cover-collage-single')).not.toBeInTheDocument();
    expect(screen.getByTestId('cover-collage-placeholder')).toHaveTextContent('♪');
  });

  test('shows the custom image instead of the collage when playlist.image_path is set, and it stays clickable', async () => {
    apiService.getPlaylist.mockResolvedValue({
      data: {
        playlist: { id: 20, name: 'Test Playlist', user_id: 1, image_path: 'cover.jpg' },
        tracks: [
          { id: 1, title: 'A1', duration: 100, album: { id: 1, title: 'Album 1', artist: { id: 900, name: 'X' } }, artist: { name: 'X' }, image_path: 'a.jpg' },
          { id: 2, title: 'B1', duration: 100, album: { id: 2, title: 'Album 2', artist: { id: 900, name: 'X' } }, artist: { name: 'X' }, image_path: 'b.jpg' },
          { id: 3, title: 'C1', duration: 100, album: { id: 3, title: 'Album 3', artist: { id: 900, name: 'X' } }, artist: { name: 'X' }, image_path: 'c.jpg' },
          { id: 4, title: 'D1', duration: 100, album: { id: 4, title: 'Album 4', artist: { id: 900, name: 'X' } }, artist: { name: 'X' }, image_path: 'd.jpg' },
        ],
      },
    });
    renderPlaylist();
    await screen.findByText('Test Playlist');

    expect(screen.queryByTestId('cover-collage')).not.toBeInTheDocument();
    expect(screen.queryByTestId('cover-collage-single')).not.toBeInTheDocument();

    const img = screen.getByAltText('Test Playlist');
    expect(img).toHaveAttribute('src', 'http://example.com/album_page/cover.jpg');
    expect(img.style.cursor).toBe('zoom-in');
  });
});

describe('Playlist page — Edit button access', () => {
  test('shows Edit in the overflow menu for a non-admin user who owns the playlist', async () => {
    useAuthStore.setState({ isAdmin: false, user: { id: 1 }, isAuthenticated: true });
    renderPlaylist();
    await screen.findByText('Test Playlist');

    fireEvent.click(screen.getByRole('button', { name: 'More options' }));

    expect(screen.getByText('✎ Edit')).toBeInTheDocument();
  });

  test('hides Edit from the overflow menu for a non-admin user who does not own the playlist', async () => {
    useAuthStore.setState({ isAdmin: false, user: { id: 999 }, isAuthenticated: true });
    renderPlaylist();
    await screen.findByText('Test Playlist');

    fireEvent.click(screen.getByRole('button', { name: 'More options' }));

    expect(screen.queryByText('✎ Edit')).not.toBeInTheDocument();
  });
});

describe('Playlist page — header context menu', () => {
  test('right-clicking the header shows Favorite', async () => {
    renderPlaylist();
    await screen.findByText('Test Playlist');

    fireEvent.contextMenu(screen.getByText('Test Playlist').closest('div'));

    expect(screen.getByText('☆ Add to Favorites')).toBeInTheDocument();
  });

  test('shows nothing on right-click when logged out', async () => {
    useAuthStore.setState({ isAdmin: false, user: null, isAuthenticated: false });
    renderPlaylist();
    await screen.findByText('Test Playlist');

    fireEvent.contextMenu(screen.getByText('Test Playlist').closest('div'));

    expect(screen.queryByText(/Favorites/)).not.toBeInTheDocument();
  });

  test('clicking Favorite calls toggleFavorite with the playlist kind/id', async () => {
    const toggleFavorite = vi.fn();
    useFavoritesStore.setState({ isFavorite: () => false, toggleFavorite });
    renderPlaylist();
    await screen.findByText('Test Playlist');

    fireEvent.contextMenu(screen.getByText('Test Playlist').closest('div'));
    fireEvent.click(screen.getByText('☆ Add to Favorites'));

    expect(toggleFavorite).toHaveBeenCalledWith('playlist', playlistData.playlist.id, expect.objectContaining({ id: playlistData.playlist.id, name: playlistData.playlist.name }));
  });

  test('Edit shows for the playlist owner', async () => {
    useAuthStore.setState({ isAdmin: false, user: { id: 1 }, isAuthenticated: true });
    renderPlaylist();
    await screen.findByText('Test Playlist');

    fireEvent.contextMenu(screen.getByText('Test Playlist').closest('div'));

    expect(screen.getByText('✎ Edit')).toBeInTheDocument();
  });

  test('Edit is absent for a non-owner, non-admin', async () => {
    useAuthStore.setState({ isAdmin: false, user: { id: 999 }, isAuthenticated: true });
    renderPlaylist();
    await screen.findByText('Test Playlist');

    fireEvent.contextMenu(screen.getByText('Test Playlist').closest('div'));

    expect(screen.queryByText('✎ Edit')).not.toBeInTheDocument();
  });

  test('Share shows only when authenticated', async () => {
    renderPlaylist();
    await screen.findByText('Test Playlist');

    fireEvent.contextMenu(screen.getByText('Test Playlist').closest('div'));

    expect(screen.getByText('📤 Share')).toBeInTheDocument();
  });
});

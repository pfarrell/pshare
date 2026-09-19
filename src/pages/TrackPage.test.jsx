import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter, Routes, Route, useLocation } from 'react-router-dom';
import TrackPage from './TrackPage';
import { usePlayerStore } from '../stores/playerStore';
import { useAuthStore } from '../stores/authStore';
import { useFavoritesStore } from '../stores/favoritesStore';
import { apiService } from '../services/api';
import { shareLink } from '../utils/shareLink';

vi.mock('../utils/shareLink', () => ({ shareLink: vi.fn() }));
vi.mock('../components/AddToPlaylistModal', () => ({ default: () => null }));
vi.mock('../components/TrackNotesModal', () => ({ default: () => null }));
vi.mock('../services/api', () => ({
  apiService: {
    getTrack: vi.fn(),
    getImageUrl: () => 'http://example.com/image.jpg',
  },
}));

const trackData = {
  track: {
    id: 1,
    title: 'Test Track',
    track_number: 1,
    duration: 245,
    artist: { id: 5, name: 'Test Artist' },
    album: { id: 10, title: 'Test Album', artist: { id: 5, name: 'Test Artist' } },
    image_path: 'a.jpg',
    url: 'http://example.com/stream/1',
    download_url: 'http://example.com/download/1',
  },
};

// Renders the destination's pathname+search as plain text so a test can
// assert exactly where navigate() landed, including query string content
// (e.g. login's return_to), without needing the target page's real component.
const LocationDisplay = () => {
  const location = useLocation();
  return <div data-testid="location-display">{location.pathname}{location.search}</div>;
};

const renderTrackPage = () =>
  render(
    <MemoryRouter initialEntries={['/track/1']}>
      <Routes>
        <Route path="/track/:id" element={<TrackPage />} />
        <Route path="/artist/:id" element={<LocationDisplay />} />
        <Route path="/album/:id" element={<LocationDisplay />} />
        <Route path="/login" element={<LocationDisplay />} />
      </Routes>
    </MemoryRouter>
  );

beforeEach(() => {
  useAuthStore.setState({ isAdmin: false, isAuthenticated: true });
  useFavoritesStore.setState({ isFavorite: () => false, toggleFavorite: vi.fn() });
  usePlayerStore.setState({
    clearPlaylist: vi.fn(),
    addTrack: vi.fn(),
    setPageTracks: vi.fn(),
    currentTrack: null,
    playlist: [],
  });
  shareLink.mockClear();
});

test('shows a loading state before the track loads', () => {
  apiService.getTrack.mockReturnValue(new Promise(() => {})); // never resolves
  renderTrackPage();

  expect(screen.getByText('Loading track...')).toBeInTheDocument();
});

test('renders track title, artist ("by"), and album ("from") once loaded', async () => {
  apiService.getTrack.mockResolvedValue({ data: trackData });
  renderTrackPage();

  await screen.findByText('Test Track');

  expect(screen.getByText('by')).toBeInTheDocument();
  expect(screen.getByText('Test Artist')).toBeInTheDocument();
  expect(screen.getByText('from')).toBeInTheDocument();
  expect(screen.getByText('Test Album')).toBeInTheDocument();
});

test('shows an error state when the fetch fails', async () => {
  // A rejected request sets `error`, which the not-found branch prefers
  // over the literal 'Track not found' string — matching Album.jsx's
  // `{error || 'Album not found'}` pattern, where 'Album not found' only
  // shows for a resolved-but-empty response, not a network failure.
  apiService.getTrack.mockRejectedValue(new Error('404'));
  renderTrackPage();

  await screen.findByText('Failed to load track');
});

test('shows a not-found state when the API returns no track', async () => {
  apiService.getTrack.mockResolvedValue({ data: { track: null } });
  renderTrackPage();

  await screen.findByText('Track not found');
});

test('the hero play button appends this track to the queue', async () => {
  const addTrack = vi.fn();
  usePlayerStore.setState({ addTrack, setPageTracks: vi.fn(), currentTrack: null, playlist: [] });
  apiService.getTrack.mockResolvedValue({ data: trackData });
  renderTrackPage();
  await screen.findByText('Test Track');

  fireEvent.click(screen.getByRole('button', { name: 'Play' }));

  expect(addTrack).toHaveBeenCalledWith(trackData.track, { flashActivity: true });
});

describe('TrackPage — cover art zoom modal', () => {
  test('clicking the cover art opens an enlarged view with the track title and artist', async () => {
    apiService.getTrack.mockResolvedValue({ data: trackData });
    renderTrackPage();
    await screen.findByText('Test Track');

    fireEvent.click(screen.getByAltText('Test Track'));

    // Two images now: the header thumbnail and the enlarged modal copy.
    expect(screen.getAllByAltText('Test Track')).toHaveLength(2);
    expect(screen.getByText('Test Artist', { selector: 'div' })).toBeInTheDocument();
  });

  test('clicking the enlarged view closes it', async () => {
    apiService.getTrack.mockResolvedValue({ data: trackData });
    renderTrackPage();
    await screen.findByText('Test Track');

    fireEvent.click(screen.getByAltText('Test Track'));
    expect(screen.getAllByAltText('Test Track')).toHaveLength(2);

    const enlarged = screen.getAllByAltText('Test Track')[1];
    fireEvent.click(enlarged.closest('div'));

    expect(screen.getAllByAltText('Test Track')).toHaveLength(1);
  });
});

describe('TrackPage — artist/album links', () => {
  test('logged in: clicking the artist name navigates to the artist page', async () => {
    apiService.getTrack.mockResolvedValue({ data: trackData });
    renderTrackPage();
    await screen.findByText('Test Track');

    fireEvent.click(screen.getByText('Test Artist'));

    expect(await screen.findByTestId('location-display')).toHaveTextContent('/artist/5');
  });

  test('logged in: clicking the album title navigates to the album page', async () => {
    apiService.getTrack.mockResolvedValue({ data: trackData });
    renderTrackPage();
    await screen.findByText('Test Track');

    fireEvent.click(screen.getByText('Test Album'));

    expect(await screen.findByTestId('location-display')).toHaveTextContent('/album/10');
  });

  test('logged out: clicking the artist name goes to login with return_to pointed back at this track', async () => {
    useAuthStore.setState({ isAdmin: false, isAuthenticated: false });
    apiService.getTrack.mockResolvedValue({ data: trackData });
    renderTrackPage();
    await screen.findByText('Test Track');

    fireEvent.click(screen.getByText('Test Artist'));

    const location = await screen.findByTestId('location-display');
    expect(location).toHaveTextContent('/login');
    expect(location.textContent).toContain(encodeURIComponent('/track/1'));
  });

  test('logged out: clicking the album title goes to login with return_to pointed back at this track', async () => {
    useAuthStore.setState({ isAdmin: false, isAuthenticated: false });
    apiService.getTrack.mockResolvedValue({ data: trackData });
    renderTrackPage();
    await screen.findByText('Test Track');

    fireEvent.click(screen.getByText('Test Album'));

    const location = await screen.findByTestId('location-display');
    expect(location).toHaveTextContent('/login');
    expect(location.textContent).toContain(encodeURIComponent('/track/1'));
  });
});

describe('TrackPage — also appears on', () => {
  test('renders an album card for each entry in other_albums', async () => {
    apiService.getTrack.mockResolvedValue({
      data: {
        track: {
          ...trackData.track,
          other_albums: [
            { id: 20, title: 'Greatest Hits', release_year: '1999', image_path: 'b.jpg', artist: { id: 5, name: 'Test Artist' }, track_count: 12 },
          ],
        },
      },
    });
    renderTrackPage();
    await screen.findByText('Test Track');

    expect(screen.getByText('Also Appears On')).toBeInTheDocument();
    expect(screen.getByText('Greatest Hits')).toBeInTheDocument();
  });

  test('renders nothing when other_albums is empty', async () => {
    apiService.getTrack.mockResolvedValue({ data: { track: { ...trackData.track, other_albums: [] } } });
    renderTrackPage();
    await screen.findByText('Test Track');

    expect(screen.queryByText('Also Appears On')).not.toBeInTheDocument();
  });

  test('renders nothing when other_albums is absent (back-compat with older responses)', async () => {
    apiService.getTrack.mockResolvedValue({ data: trackData });
    renderTrackPage();
    await screen.findByText('Test Track');

    expect(screen.queryByText('Also Appears On')).not.toBeInTheDocument();
  });

  test('clicking an also-appears-on album navigates to it', async () => {
    apiService.getTrack.mockResolvedValue({
      data: {
        track: {
          ...trackData.track,
          other_albums: [
            { id: 20, title: 'Greatest Hits', release_year: '1999', image_path: 'b.jpg', artist: { id: 5, name: 'Test Artist' }, track_count: 12 },
          ],
        },
      },
    });
    renderTrackPage();
    await screen.findByText('Test Track');

    fireEvent.click(screen.getByText('Greatest Hits'));

    expect(await screen.findByTestId('location-display')).toHaveTextContent('/album/20');
  });
});

describe('TrackPage — header long-press menu', () => {
  const openMenu = async () => {
    await screen.findByText('Test Track');
    fireEvent.contextMenu(screen.getByText('Test Track').closest('.media-page-header'));
  };

  beforeEach(() => {
    apiService.getTrack.mockResolvedValue({ data: trackData });
  });

  test('shows Add to Playlist, Notes, Favorite, Download, and Share when logged in', async () => {
    renderTrackPage();
    await openMenu();

    expect(screen.getByText('📋 Add to Playlist')).toBeInTheDocument();
    expect(screen.getByText('📝 Notes')).toBeInTheDocument();
    expect(screen.getByText('☆ Add to Favorites')).toBeInTheDocument();
    expect(screen.getByText('⬇ Download')).toBeInTheDocument();
    expect(screen.getByText('📤 Share')).toBeInTheDocument();
  });

  test('Share shares the track title and artist (no em dash)', async () => {
    renderTrackPage();
    await openMenu();

    fireEvent.click(screen.getByText('📤 Share'));

    expect(shareLink).toHaveBeenCalledWith({ title: 'Test Track', text: 'Test Track by Test Artist' });
  });

  test('does not open at all when logged out', async () => {
    useAuthStore.setState({ isAdmin: false, isAuthenticated: false });
    renderTrackPage();
    await openMenu();

    expect(screen.queryByTestId('track-page-header-menu-backdrop')).not.toBeInTheDocument();
  });

  test('Edit shows only for admins', async () => {
    useAuthStore.setState({ isAdmin: true, isAuthenticated: true });
    renderTrackPage();
    await openMenu();

    expect(screen.getByText('✎ Edit')).toBeInTheDocument();
  });

  test('Edit is absent for a non-admin', async () => {
    renderTrackPage();
    await openMenu();

    expect(screen.queryByText('✎ Edit')).not.toBeInTheDocument();
  });

  test('clicking Favorite calls toggleFavorite with the track kind/id', async () => {
    const toggleFavorite = vi.fn();
    useFavoritesStore.setState({ isFavorite: () => false, toggleFavorite });
    renderTrackPage();
    await openMenu();

    fireEvent.click(screen.getByText('☆ Add to Favorites'));

    expect(toggleFavorite).toHaveBeenCalledWith('track', trackData.track.id, expect.objectContaining({ id: trackData.track.id, title: trackData.track.title }));
  });
});

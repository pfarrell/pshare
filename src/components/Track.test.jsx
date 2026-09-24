import { Profiler, createRef } from 'react';
import { render, screen, fireEvent, act, waitFor } from '@testing-library/react';
import { MemoryRouter, useNavigate } from 'react-router-dom';
import Track from './Track';
import { usePlayerStore } from '../stores/playerStore';
import { useAuthStore } from '../stores/authStore';
import { useFavoritesStore } from '../stores/favoritesStore';
import { apiService } from '../services/api';
import { shareLink } from '../utils/shareLink';

vi.mock('./AddToPlaylistModal', () => ({ default: () => null }));
vi.mock('./TrackNotesModal', () => ({ default: () => null }));

vi.mock('../services/api', () => ({
  apiService: { makeTrackSingle: vi.fn() },
}));

vi.mock('../utils/shareLink', () => ({ shareLink: vi.fn() }));

vi.mock('react-router-dom', async (importOriginal) => {
  const actual = await importOriginal();
  return { ...actual, useNavigate: vi.fn() };
});

const mockTrack = {
  id: 1,
  title: 'Test Track',
  duration: 180,
  artist: { id: 2, name: 'Test Artist' },
  album: {
    id: 10,
    title: 'Test Album',
    artist: { id: 5, name: 'Album Artist' },
  },
  download_url: 'http://localhost:3000/download/1',
};

const renderTrack = (props = {}, { route = '/' } = {}) =>
  render(
    <MemoryRouter initialEntries={[route]}>
      <Track track={mockTrack} index={0} trackCount={1} {...props} />
    </MemoryRouter>
  );

beforeEach(() => {
  usePlayerStore.setState({
    playlist: [],
    currentTrack: null,
    isPlaying: false,
    currentTrackIndex: -1,
    addTrack: vi.fn(),
    addTracks: vi.fn(),
    clearPlaylist: vi.fn(),
    playTrackAtIndex: vi.fn(),
  });
  useAuthStore.setState({ isAuthenticated: false });
  useFavoritesStore.setState({ isFavorite: () => false, toggleFavorite: vi.fn() });
  useNavigate.mockReturnValue(vi.fn());
  shareLink.mockClear();
});

describe('Track component', () => {
  test('renders the track title', () => {
    renderTrack();
    expect(screen.getByText(/Test Track/)).toBeInTheDocument();
  });

  test('renders track number', () => {
    renderTrack();
    expect(screen.getByText(/01\./)).toBeInTheDocument();
  });

  test('renders play button when not playing', () => {
    renderTrack({ isPlaying: false });
    expect(screen.getByRole('button', { name: 'Play Test Track' })).toBeInTheDocument();
  });

  test('renders now-playing indicator when isPlaying is true', () => {
    renderTrack({ isPlaying: true });
    expect(screen.getByText('♪')).toBeInTheDocument();
  });

  test('does not render album link when includeMeta is false', () => {
    renderTrack({ includeMeta: false });
    expect(screen.queryByText('Test Album')).not.toBeInTheDocument();
  });

  test('renders album link when includeMeta is true', () => {
    renderTrack({ includeMeta: true });
    expect(screen.getByText('Test Album')).toBeInTheDocument();
  });

  test('renders artist link when includeMeta is true', () => {
    renderTrack({ includeMeta: true });
    expect(screen.getByText('Album Artist')).toBeInTheDocument();
  });

  test('omits "from <album>" for tracks in the _Singles pseudo-album', () => {
    renderTrack({
      includeMeta: true,
      track: { ...mockTrack, album: { ...mockTrack.album, title: '_Singles' } },
    });
    expect(screen.queryByText('_Singles')).not.toBeInTheDocument();
    expect(screen.getByText('Album Artist')).toBeInTheDocument();
  });

  test('renders formatted duration', () => {
    renderTrack();
    expect(screen.getByText('(3:00)')).toBeInTheDocument();
  });

  test('long-press menu stays open after finger release, closes on a later tap-away', () => {
    vi.useFakeTimers();
    renderTrack();
    const playButton = screen.getByRole('button', { name: 'Play Test Track' });

    // Long-press on the play button opens the playback menu (finger still down)
    fireEvent.touchStart(playButton, { touches: [{ clientX: 50, clientY: 50 }] });
    act(() => { vi.advanceTimersByTime(500); });
    expect(screen.getByText('▶ Play Now')).toBeInTheDocument();

    // Finger lifts, then the synthesized click lands on the backdrop — menu must persist
    fireEvent.touchEnd(playButton);
    fireEvent.click(screen.getByTestId('track-play-menu-backdrop'));
    expect(screen.getByText('▶ Play Now')).toBeInTheDocument();

    // After the release window, a deliberate tap on the backdrop closes it
    act(() => { vi.advanceTimersByTime(350); });
    fireEvent.click(screen.getByTestId('track-play-menu-backdrop'));
    expect(screen.queryByText('▶ Play Now')).not.toBeInTheDocument();

    vi.useRealTimers();
  });

  test('a stray click landing on a menu item right after a long-press open does not trigger it', () => {
    vi.useFakeTimers();
    renderWithPlayer();
    const playButton = screen.getByRole('button', { name: 'Play Test Track' });

    fireEvent.touchStart(playButton, { touches: [{ clientX: 50, clientY: 50 }] });
    act(() => { vi.advanceTimersByTime(500); });
    expect(screen.getByText('➕ Add to Queue')).toBeInTheDocument();

    // Simulates the browser dispatching a synthetic click at the release
    // coordinates, which can land on whichever menu item now renders there.
    fireEvent.click(screen.getByText('➕ Add to Queue'));
    expect(usePlayerStore.getState().addTrack).not.toHaveBeenCalled();

    // A deliberate tap once the guard window has elapsed still works.
    act(() => { vi.advanceTimersByTime(350); });
    fireEvent.click(screen.getByText('➕ Add to Queue'));
    expect(usePlayerStore.getState().addTrack).toHaveBeenCalledWith(mockTrack, { flashActivity: true });

    vi.useRealTimers();
  });

  test('Notes menu item closes the dropdown when clicked', () => {
    useAuthStore.setState({ isAuthenticated: true });
    renderTrack();
    fireEvent.contextMenu(screen.getByText(/Test Track/).closest('.track-item'));
    expect(screen.getByText('📝 Notes')).toBeInTheDocument();

    fireEvent.click(screen.getByText('📝 Notes'));
    expect(screen.queryByTestId('track-menu-backdrop')).not.toBeInTheDocument();
  });

  describe('Track row — Notes menu item', () => {
    test('shows the Notes button when logged in', () => {
      useAuthStore.setState({ isAdmin: false, isAuthenticated: true });
      renderTrack();

      fireEvent.contextMenu(screen.getByText(/Test Track/).closest('.track-item'));

      expect(screen.getByText('📝 Notes')).toBeInTheDocument();
    });

    test('hides the Notes button when logged out', () => {
      useAuthStore.setState({ isAdmin: false, isAuthenticated: false });
      renderTrack();

      fireEvent.contextMenu(screen.getByText(/Test Track/).closest('.track-item'));

      expect(screen.queryByText('📝 Notes')).not.toBeInTheDocument();
    });
  });

  const renderWithPlayer = () => {
    usePlayerStore.setState({
      playlist: [],
      addTrack: vi.fn(),
      addTracks: vi.fn(),
      clearPlaylist: vi.fn(),
      setPlaylist: vi.fn(),
      playTrackAtIndex: vi.fn(),
    });
    return renderTrack();
  };

  test('Add to Queue flags activity for the player to pulse', () => {
    renderWithPlayer();
    fireEvent.contextMenu(screen.getByRole('button', { name: 'Play Test Track' }));
    fireEvent.click(screen.getByText('➕ Add to Queue'));
    expect(usePlayerStore.getState().addTrack).toHaveBeenCalledWith(mockTrack, { flashActivity: true });
  });

  test('Play Next flags activity for the player to pulse', () => {
    renderWithPlayer();
    fireEvent.contextMenu(screen.getByRole('button', { name: 'Play Test Track' }));
    fireEvent.click(screen.getByText('⏭ Play Next'));
    expect(usePlayerStore.getState().addTracks).toHaveBeenCalledWith([mockTrack], true, { flashActivity: true });
  });

  test('tapping the play button appends this track to the queue', () => {
    renderWithPlayer();
    fireEvent.click(screen.getByRole('button', { name: 'Play Test Track' }));
    expect(usePlayerStore.getState().addTrack).toHaveBeenCalledWith(mockTrack, { flashActivity: true });
    expect(usePlayerStore.getState().addTracks).not.toHaveBeenCalled();
  });

  test('Play Now in the menu replaces the queue outright with just this track', () => {
    renderWithPlayer();
    fireEvent.contextMenu(screen.getByRole('button', { name: 'Play Test Track' }));
    fireEvent.click(screen.getByText('▶ Play Now'));
    expect(usePlayerStore.getState().setPlaylist).toHaveBeenCalledWith([mockTrack]);
    expect(usePlayerStore.getState().addTrack).not.toHaveBeenCalled();
  });

  test('Add to Queue flashes the pressed button before the menu closes', () => {
    renderWithPlayer();
    fireEvent.contextMenu(screen.getByRole('button', { name: 'Play Test Track' }));
    const button = screen.getByText('➕ Add to Queue');
    fireEvent.click(button);
    expect(button).toHaveClass('menu-btn-pressed');
  });

  test('Play Next flashes the pressed button before the menu closes', () => {
    renderWithPlayer();
    fireEvent.contextMenu(screen.getByRole('button', { name: 'Play Test Track' }));
    const button = screen.getByText('⏭ Play Next');
    fireEvent.click(button);
    expect(button).toHaveClass('menu-btn-pressed');
  });

  describe('Download menu item', () => {
    afterEach(() => {
      import.meta.env.VITE_ENABLE_DOWNLOADS = 'false';
      Object.defineProperty(window, 'innerWidth', { value: 1024, configurable: true });
    });

    test('does not render on mobile, even if logged in and the flag is enabled (browser-only feature)', () => {
      import.meta.env.VITE_ENABLE_DOWNLOADS = 'true';
      useAuthStore.setState({ isAuthenticated: true });
      Object.defineProperty(window, 'innerWidth', { value: 500, configurable: true });
      renderTrack();
      fireEvent.contextMenu(screen.getByText(/Test Track/).closest('.track-item'));
      expect(screen.queryByText('⬇ Download')).not.toBeInTheDocument();
    });

    test('does not render when logged out, even if the flag is enabled', () => {
      import.meta.env.VITE_ENABLE_DOWNLOADS = 'true';
      useAuthStore.setState({ isAuthenticated: false });
      renderTrack();
      fireEvent.contextMenu(screen.getByText(/Test Track/).closest('.track-item'));
      expect(screen.queryByText('⬇ Download')).not.toBeInTheDocument();
    });

    test('does not render when logged in but the flag is disabled', () => {
      import.meta.env.VITE_ENABLE_DOWNLOADS = 'false';
      useAuthStore.setState({ isAuthenticated: true });
      renderTrack();
      fireEvent.contextMenu(screen.getByText(/Test Track/).closest('.track-item'));
      expect(screen.queryByText('⬇ Download')).not.toBeInTheDocument();
    });

    test('renders when logged in and the flag is enabled', () => {
      import.meta.env.VITE_ENABLE_DOWNLOADS = 'true';
      useAuthStore.setState({ isAuthenticated: true });
      renderTrack();
      fireEvent.contextMenu(screen.getByText(/Test Track/).closest('.track-item'));
      expect(screen.getByText('⬇ Download')).toBeInTheDocument();
    });

    test('renders by default when the flag is unset (on unless explicitly disabled)', () => {
      delete import.meta.env.VITE_ENABLE_DOWNLOADS;
      useAuthStore.setState({ isAuthenticated: true });
      renderTrack();
      fireEvent.contextMenu(screen.getByText(/Test Track/).closest('.track-item'));
      expect(screen.getByText('⬇ Download')).toBeInTheDocument();
    });

    test('clicking Download navigates to the track download_url and closes the menu', () => {
      import.meta.env.VITE_ENABLE_DOWNLOADS = 'true';
      useAuthStore.setState({ isAuthenticated: true });
      // jsdom's window.location is non-configurable; redefine it with
      // writable: true rather than deleting it (which throws in jsdom 29).
      Object.defineProperty(window, 'location', {
        writable: true,
        value: { href: '' },
      });
      renderTrack();
      fireEvent.contextMenu(screen.getByText(/Test Track/).closest('.track-item'));
      fireEvent.click(screen.getByText('⬇ Download'));
      expect(window.location.href).toBe(mockTrack.download_url);
      expect(screen.queryByText('⬇ Download')).not.toBeInTheDocument();
    });
  });

});

describe('Track component — store subscription granularity', () => {
  // While a track is loading, usePlayerEngine fires setBuffering()/setCurrentTime() repeatedly
  // (every 'waiting'/'timeupdate' event) as separate macrotasks. If Track subscribes to the
  // whole player store instead of the specific fields it reads, every one of those unrelated
  // updates forces every <Track> row on the page to re-render, which is expensive enough across
  // a long tracklist to visibly stall other main-thread work (e.g. a route-navigation click)
  // for as long as the track keeps buffering.
  test('does not re-render on unrelated player-store field changes (e.g. buffering/currentTime during track load)', () => {
    const onRender = vi.fn();
    render(
      <MemoryRouter initialEntries={['/']}>
        <Profiler id="track" onRender={onRender}>
          <Track track={mockTrack} index={0} trackCount={1} />
        </Profiler>
      </MemoryRouter>
    );
    onRender.mockClear();

    act(() => {
      usePlayerStore.setState({ isBuffering: true });
    });
    act(() => {
      usePlayerStore.setState({ currentTime: 1.5 });
    });

    expect(onRender).not.toHaveBeenCalled();
  });
});

describe('Track component — per-track artist display', () => {
  test('shows track artist suffix when ids differ, even if names happen to match', () => {
    renderTrack({
      track: {
        ...mockTrack,
        artist: { id: 99, name: 'Album Artist' },
        album: { ...mockTrack.album, artist: { id: 5, name: 'Album Artist' } },
      },
    });
    expect(screen.getByText(/- Album Artist/)).toBeInTheDocument();
  });

  test('hides track artist suffix when ids match, even if names differ', () => {
    renderTrack({
      track: {
        ...mockTrack,
        artist: { id: 5, name: 'Renamed Artist' },
        album: { ...mockTrack.album, artist: { id: 5, name: 'Album Artist' } },
      },
    });
    expect(screen.queryByText(/- Renamed Artist/)).not.toBeInTheDocument();
  });

  test('does not crash when the track has no album (orphaned track, no FK constraint on tracks.album_id)', () => {
    renderTrack({
      track: {
        ...mockTrack,
        artist: { id: 99, name: 'Orphan Artist' },
        album: null,
      },
    });
    expect(screen.getByText(/- Orphan Artist/)).toBeInTheDocument();
  });
});

describe('Track component — scroll anchor (Album page scrolling to the playing track)', () => {
  test('forwards a ref to the track-item root element', () => {
    const ref = createRef();
    render(
      <MemoryRouter initialEntries={['/']}>
        <Track ref={ref} track={mockTrack} index={0} trackCount={1} />
      </MemoryRouter>
    );
    expect(ref.current).toBe(screen.getByText(/Test Track/).closest('.track-item'));
  });

  test('adds the scroll-below-fixed-header class when scrollAnchor is true', () => {
    renderTrack({ scrollAnchor: true });
    expect(screen.getByText(/Test Track/).closest('.track-item')).toHaveClass('scroll-below-fixed-header');
  });

  test('omits the scroll-below-fixed-header class by default', () => {
    renderTrack();
    expect(screen.getByText(/Test Track/).closest('.track-item')).not.toHaveClass('scroll-below-fixed-header');
  });
});

describe('Track component — Make Single menu item', () => {
  beforeEach(() => {
    apiService.makeTrackSingle.mockReset();
  });

  test('does not render when showMakeSingle is false (default)', () => {
    renderTrack();
    fireEvent.contextMenu(screen.getByText(/Test Track/).closest('.track-item'));
    expect(screen.queryByText(/Make Single/)).not.toBeInTheDocument();
  });

  test('renders when showMakeSingle is true and the track has an album', () => {
    renderTrack({ showMakeSingle: true });
    fireEvent.contextMenu(screen.getByText(/Test Track/).closest('.track-item'));
    expect(screen.getByText('🎵 Make Single')).toBeInTheDocument();
  });

  test('does not render when the track has no album', () => {
    renderTrack({ showMakeSingle: true, track: { ...mockTrack, album: null } });
    fireEvent.contextMenu(screen.getByText(/Test Track/).closest('.track-item'));
    expect(screen.queryByText(/Make Single/)).not.toBeInTheDocument();
  });

  test('does not render when the track is already in the _Singles album', () => {
    renderTrack({ showMakeSingle: true, track: { ...mockTrack, album: { ...mockTrack.album, title: '_Singles' } } });
    fireEvent.contextMenu(screen.getByText(/Test Track/).closest('.track-item'));
    expect(screen.queryByText(/Make Single/)).not.toBeInTheDocument();
  });

  test('clicking it confirms, calls makeTrackSingle, and notifies the parent via onMadeSingle', async () => {
    window.confirm = vi.fn(() => true);
    apiService.makeTrackSingle.mockResolvedValue({ data: {} });
    const onMadeSingle = vi.fn();
    renderTrack({ showMakeSingle: true, onMadeSingle });
    fireEvent.contextMenu(screen.getByText(/Test Track/).closest('.track-item'));

    fireEvent.click(screen.getByText('🎵 Make Single'));

    expect(window.confirm).toHaveBeenCalledWith(
      'Remove "Test Track" from this album and register it as a single for Test Artist?'
    );
    await waitFor(() => expect(apiService.makeTrackSingle).toHaveBeenCalledWith(mockTrack.id));
    await waitFor(() => expect(onMadeSingle).toHaveBeenCalledWith(mockTrack.id));
    expect(screen.queryByText('🎵 Make Single')).not.toBeInTheDocument();
  });

  test('does nothing when the confirm dialog is dismissed', () => {
    window.confirm = vi.fn(() => false);
    renderTrack({ showMakeSingle: true });
    fireEvent.contextMenu(screen.getByText(/Test Track/).closest('.track-item'));

    fireEvent.click(screen.getByText('🎵 Make Single'));

    expect(apiService.makeTrackSingle).not.toHaveBeenCalled();
  });

  test('shows an alert and does not call onMadeSingle when the API call fails', async () => {
    window.confirm = vi.fn(() => true);
    window.alert = vi.fn();
    apiService.makeTrackSingle.mockRejectedValue({ response: { data: { error: 'boom' } } });
    const onMadeSingle = vi.fn();
    renderTrack({ showMakeSingle: true, onMadeSingle });
    fireEvent.contextMenu(screen.getByText(/Test Track/).closest('.track-item'));

    fireEvent.click(screen.getByText('🎵 Make Single'));

    await waitFor(() => expect(window.alert).toHaveBeenCalledWith('Failed to make track a single: boom'));
    expect(onMadeSingle).not.toHaveBeenCalled();
  });

  test('does not crash when the track has no artist name (orphaned track, no FK constraint on tracks.artist_id)', () => {
    window.confirm = vi.fn(() => true);
    renderTrack({ showMakeSingle: true, track: { ...mockTrack, artist: { id: null, name: undefined } } });
    fireEvent.contextMenu(screen.getByText(/Test Track/).closest('.track-item'));

    expect(() => fireEvent.click(screen.getByText('🎵 Make Single'))).not.toThrow();
    expect(window.confirm).toHaveBeenCalledWith('Remove "Test Track" from this album and register it as a single for this artist?');
  });
});

describe('Track component — Edit menu item', () => {
  test('does not render when showEdit is false (default)', () => {
    renderTrack();
    fireEvent.contextMenu(screen.getByText(/Test Track/).closest('.track-item'));
    expect(screen.queryByText('✏️ Edit')).not.toBeInTheDocument();
  });

  test('renders when showEdit is true', () => {
    renderTrack({ showEdit: true });
    fireEvent.contextMenu(screen.getByText(/Test Track/).closest('.track-item'));
    expect(screen.getByText('✏️ Edit')).toBeInTheDocument();
  });

  test('navigates to /admin/track/:id and closes the menu on click', () => {
    const navigate = vi.fn();
    useNavigate.mockReturnValue(navigate);
    renderTrack({ showEdit: true });
    fireEvent.contextMenu(screen.getByText(/Test Track/).closest('.track-item'));
    fireEvent.click(screen.getByText('✏️ Edit'));
    expect(navigate).toHaveBeenCalledWith('/admin/track/1');
    expect(screen.queryByText('✏️ Edit')).not.toBeInTheDocument();
  });
});

describe('Track component — Favorite menu item', () => {
  test('does not render when logged out', () => {
    useAuthStore.setState({ isAuthenticated: false });
    renderTrack();
    fireEvent.contextMenu(screen.getByText(/Test Track/).closest('.track-item'));
    expect(screen.queryByText(/Favorites/)).not.toBeInTheDocument();
  });

  test('shows "Add to Favorites" when not yet favorited', () => {
    useAuthStore.setState({ isAuthenticated: true });
    useFavoritesStore.setState({ isFavorite: () => false, toggleFavorite: vi.fn() });
    renderTrack();
    fireEvent.contextMenu(screen.getByText(/Test Track/).closest('.track-item'));
    expect(screen.getByText('☆ Add to Favorites')).toBeInTheDocument();
  });

  test('shows "Remove from Favorites" when already favorited', () => {
    useAuthStore.setState({ isAuthenticated: true });
    useFavoritesStore.setState({ isFavorite: () => true, toggleFavorite: vi.fn() });
    renderTrack();
    fireEvent.contextMenu(screen.getByText(/Test Track/).closest('.track-item'));
    expect(screen.getByText('★ Remove from Favorites')).toBeInTheDocument();
  });

  test('clicking it calls toggleFavorite with the track kind/id and closes the menu', () => {
    useAuthStore.setState({ isAuthenticated: true });
    const toggleFavorite = vi.fn();
    useFavoritesStore.setState({ isFavorite: () => false, toggleFavorite });
    renderTrack();
    fireEvent.contextMenu(screen.getByText(/Test Track/).closest('.track-item'));

    fireEvent.click(screen.getByText('☆ Add to Favorites'));

    expect(toggleFavorite).toHaveBeenCalledWith('track', mockTrack.id, expect.objectContaining({ id: mockTrack.id, title: mockTrack.title }));
    expect(screen.queryByText('☆ Add to Favorites')).not.toBeInTheDocument();
  });
});

describe('Track component — Add to Playlist menu item', () => {
  test('does not render when logged out', () => {
    useAuthStore.setState({ isAuthenticated: false });
    renderTrack();
    fireEvent.contextMenu(screen.getByText(/Test Track/).closest('.track-item'));
    expect(screen.queryByText('📋 Add to Playlist')).not.toBeInTheDocument();
  });

  test('renders when logged in', () => {
    useAuthStore.setState({ isAuthenticated: true });
    renderTrack();
    fireEvent.contextMenu(screen.getByText(/Test Track/).closest('.track-item'));
    expect(screen.getByText('📋 Add to Playlist')).toBeInTheDocument();
  });
});

describe('Track component — Go to Album / Go to Artist menu items', () => {
  test('Go to Album navigates to the track\'s album and closes the menu', () => {
    const navigate = vi.fn();
    useNavigate.mockReturnValue(navigate);
    renderTrack();
    fireEvent.contextMenu(screen.getByText(/Test Track/).closest('.track-item'));

    fireEvent.click(screen.getByText('💿 Go to Album'));

    expect(navigate).toHaveBeenCalledWith('/album/10');
    expect(screen.queryByText('💿 Go to Album')).not.toBeInTheDocument();
  });

  test('Go to Album is absent when the track has no album', () => {
    renderTrack({ track: { ...mockTrack, album: null } });
    fireEvent.contextMenu(screen.getByText(/Test Track/).closest('.track-item'));
    expect(screen.queryByText('💿 Go to Album')).not.toBeInTheDocument();
  });

  test('Go to Artist navigates to the track\'s artist and closes the menu', () => {
    const navigate = vi.fn();
    useNavigate.mockReturnValue(navigate);
    renderTrack();
    fireEvent.contextMenu(screen.getByText(/Test Track/).closest('.track-item'));

    fireEvent.click(screen.getByText('🎤 Go to Artist'));

    expect(navigate).toHaveBeenCalledWith('/artist/2');
    expect(screen.queryByText('🎤 Go to Artist')).not.toBeInTheDocument();
  });

  test('Go to Artist is absent when the track has no artist id (orphaned track, no FK constraint on tracks.artist_id)', () => {
    renderTrack({ track: { ...mockTrack, artist: { id: null, name: 'Orphan Artist' } } });
    fireEvent.contextMenu(screen.getByText(/Test Track/).closest('.track-item'));
    expect(screen.queryByText('🎤 Go to Artist')).not.toBeInTheDocument();
  });

  test('Go to Album is absent when already on that album\'s page', () => {
    renderTrack({}, { route: '/album/10' });
    fireEvent.contextMenu(screen.getByText(/Test Track/).closest('.track-item'));
    expect(screen.queryByText('💿 Go to Album')).not.toBeInTheDocument();
    expect(screen.getByText('🎤 Go to Artist')).toBeInTheDocument();
  });

  test('Go to Artist is absent when already on that artist\'s page', () => {
    renderTrack({}, { route: '/artist/2' });
    fireEvent.contextMenu(screen.getByText(/Test Track/).closest('.track-item'));
    expect(screen.queryByText('🎤 Go to Artist')).not.toBeInTheDocument();
    expect(screen.getByText('💿 Go to Album')).toBeInTheDocument();
  });
});

describe('Track component — Share menu item', () => {
  test('does not render when logged out', () => {
    useAuthStore.setState({ isAuthenticated: false });
    renderTrack();
    fireEvent.contextMenu(screen.getByText(/Test Track/).closest('.track-item'));
    expect(screen.queryByText('📤 Share')).not.toBeInTheDocument();
  });

  test('renders when logged in', () => {
    useAuthStore.setState({ isAuthenticated: true });
    renderTrack();
    fireEvent.contextMenu(screen.getByText(/Test Track/).closest('.track-item'));
    expect(screen.getByText('📤 Share')).toBeInTheDocument();
  });

  test('shares the track\'s own URL and title, not the current page', () => {
    useAuthStore.setState({ isAuthenticated: true });
    renderTrack();
    fireEvent.contextMenu(screen.getByText(/Test Track/).closest('.track-item'));

    fireEvent.click(screen.getByText('📤 Share'));

    expect(shareLink).toHaveBeenCalledWith({
      title: 'Test Track',
      text: 'Test Track — Test Artist',
      url: expect.stringContaining('/track/1'),
    });
    expect(screen.queryByText('📤 Share')).not.toBeInTheDocument();
  });

  test('falls back to the title alone when the track has no artist name', () => {
    useAuthStore.setState({ isAuthenticated: true });
    renderTrack({ track: { ...mockTrack, artist: { id: null, name: undefined } } });
    fireEvent.contextMenu(screen.getByText(/Test Track/).closest('.track-item'));

    fireEvent.click(screen.getByText('📤 Share'));

    expect(shareLink).toHaveBeenCalledWith(expect.objectContaining({ title: 'Test Track', text: 'Test Track' }));
  });
});

describe('Track component — split playback vs. row context menus', () => {
  test('long-pressing the row (not the play button) opens the row menu, not the playback menu', () => {
    vi.useFakeTimers();
    renderTrack();
    const row = screen.getByText(/Test Track/).closest('.track-item');

    fireEvent.touchStart(row, { touches: [{ clientX: 50, clientY: 50 }] });
    act(() => { vi.advanceTimersByTime(500); });

    expect(screen.getByTestId('track-menu-backdrop')).toBeInTheDocument();
    expect(screen.queryByTestId('track-play-menu-backdrop')).not.toBeInTheDocument();
    expect(screen.queryByText('▶ Play Now')).not.toBeInTheDocument();

    vi.useRealTimers();
  });

  test('long-pressing the play button opens the playback menu, not the row menu', () => {
    vi.useFakeTimers();
    renderTrack();
    const playButton = screen.getByRole('button', { name: 'Play Test Track' });

    fireEvent.touchStart(playButton, { touches: [{ clientX: 50, clientY: 50 }] });
    act(() => { vi.advanceTimersByTime(500); });

    expect(screen.getByTestId('track-play-menu-backdrop')).toBeInTheDocument();
    expect(screen.queryByTestId('track-menu-backdrop')).not.toBeInTheDocument();
    expect(screen.queryByText('💿 Go to Album')).not.toBeInTheDocument();

    vi.useRealTimers();
  });
});

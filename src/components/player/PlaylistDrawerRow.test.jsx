// src/components/player/PlaylistDrawerRow.test.jsx
import { render, screen, fireEvent, act } from '@testing-library/react';
import { MemoryRouter, useNavigate } from 'react-router-dom';
import PlaylistDrawerRow from './PlaylistDrawerRow';
import { usePlayerStore } from '../../stores/playerStore';

vi.mock('react-router-dom', async (importOriginal) => {
  const actual = await importOriginal();
  return { ...actual, useNavigate: vi.fn() };
});

const track = (id, overrides = {}) => ({
  id,
  title: `Track ${id}`,
  duration: 125,
  artist: { id: 5, name: 'Artist' },
  album: { id: 20, title: 'Album' },
  ...overrides,
});

const baseProps = (overrides = {}) => ({
  track: track(1),
  index: 0,
  isActive: false,
  isFlashing: false,
  isDragged: false,
  mobile: false,
  imageUrl: null,
  artSize: 40,
  onDragStart: vi.fn(),
  onDragOver: vi.fn(),
  onDragEnd: vi.fn(),
  onDrop: vi.fn(),
  onActivate: vi.fn(),
  onTouchStartRow: vi.fn(),
  onTouchEndRow: vi.fn(() => vi.fn()),
  onRemove: vi.fn(),
  hoverProps: {},
  ...overrides,
});

const renderRow = (props = {}, route = '/') =>
  render(
    <MemoryRouter initialEntries={[route]}>
      <PlaylistDrawerRow {...baseProps(props)} />
    </MemoryRouter>
  );

beforeEach(() => {
  usePlayerStore.setState({ closeDrawer: vi.fn() });
  useNavigate.mockReturnValue(vi.fn());
});

test('renders the track title, artist, and formatted duration', () => {
  renderRow();
  expect(screen.getByText(/Track 1 - Artist \(2:05\)/)).toBeInTheDocument();
});

test('shows the active class when isActive is true', () => {
  renderRow({ isActive: true });
  expect(screen.getByText(/Track 1/).closest('.track-item')).toHaveClass('active');
});

test('shows the flash overlay when isFlashing is true', () => {
  renderRow({ isFlashing: true });
  expect(document.querySelector('.track-item-activity-overlay')).toBeInTheDocument();
});

test('clicking a row on desktop calls onActivate with its index', () => {
  const onActivate = vi.fn();
  renderRow({ mobile: false, index: 2, onActivate });
  fireEvent.click(screen.getByText(/Track 1/));
  expect(onActivate).toHaveBeenCalledWith(2);
});

test('the delete button calls onRemove and does not also trigger row activation', () => {
  const onActivate = vi.fn();
  const onRemove = vi.fn();
  renderRow({ index: 2, onActivate, onRemove });
  fireEvent.click(screen.getByRole('button', { name: 'Remove track from playlist' }));
  expect(onRemove).toHaveBeenCalledWith(2);
  expect(onActivate).not.toHaveBeenCalled();
});

test('a short tap on mobile calls onTouchEndRow for that index', () => {
  const onTouchEndRow = vi.fn(() => vi.fn());
  renderRow({ mobile: true, index: 1, onTouchEndRow });
  const row = screen.getByText(/Track 1/).closest('.track-item');
  fireEvent.touchStart(row, { touches: [{ clientX: 10, clientY: 10 }] });
  fireEvent.touchEnd(row, { changedTouches: [{ clientX: 10, clientY: 10 }] });
  expect(onTouchEndRow).toHaveBeenCalledWith(1);
});

test('desktop rows are draggable and dragstart calls onDragStart', () => {
  const onDragStart = vi.fn();
  renderRow({ mobile: false, onDragStart });
  const row = screen.getByText(/Track 1/).closest('.track-item');
  expect(row).toHaveAttribute('draggable', 'true');
  fireEvent.dragStart(row);
  expect(onDragStart).toHaveBeenCalled();
});

test('mobile rows are not draggable', () => {
  renderRow({ mobile: true });
  const row = screen.getByText(/Track 1/).closest('.track-item');
  expect(row).toHaveAttribute('draggable', 'false');
});

test('shows the dragging class when isDragged is true', () => {
  renderRow({ isDragged: true });
  expect(screen.getByText(/Track 1/).closest('.track-item')).toHaveClass('dragging');
});

test('spreads hoverProps onto the row element', () => {
  const onMouseEnter = vi.fn();
  const onMouseMove = vi.fn();
  const onMouseLeave = vi.fn();
  renderRow({ hoverProps: { onMouseEnter, onMouseMove, onMouseLeave } });
  const row = screen.getByText(/Track 1/).closest('.track-item');

  fireEvent.mouseEnter(row);
  fireEvent.mouseMove(row);
  fireEvent.mouseLeave(row);

  expect(onMouseEnter).toHaveBeenCalled();
  expect(onMouseMove).toHaveBeenCalled();
  expect(onMouseLeave).toHaveBeenCalled();
});

describe('Go to Album / Go to Artist / Go to Playlist menu', () => {
  test('right-click opens a menu with Go to Album and Go to Artist', () => {
    renderRow();
    fireEvent.contextMenu(screen.getByText(/Track 1/).closest('.track-item'));
    expect(screen.getByText('💿 Go to Album')).toBeInTheDocument();
    expect(screen.getByText('🎤 Go to Artist')).toBeInTheDocument();
  });

  test('Go to Album is absent when the track has no album', () => {
    renderRow({ track: track(1, { album: null }) });
    fireEvent.contextMenu(screen.getByText(/Track 1/).closest('.track-item'));
    expect(screen.queryByText('💿 Go to Album')).not.toBeInTheDocument();
  });

  test('Go to Artist is absent when the track has no artist id', () => {
    renderRow({ track: track(1, { artist: { id: null, name: 'Orphan' } }) });
    fireEvent.contextMenu(screen.getByText(/Track 1/).closest('.track-item'));
    expect(screen.queryByText('🎤 Go to Artist')).not.toBeInTheDocument();
  });

  test('Go to Album is absent when already on that album\'s page', () => {
    renderRow({}, '/album/20');
    fireEvent.contextMenu(screen.getByText(/Track 1/).closest('.track-item'));
    expect(screen.queryByText('💿 Go to Album')).not.toBeInTheDocument();
    expect(screen.getByText('🎤 Go to Artist')).toBeInTheDocument();
  });

  test('Go to Artist is absent when already on that artist\'s page', () => {
    renderRow({}, '/artist/5');
    fireEvent.contextMenu(screen.getByText(/Track 1/).closest('.track-item'));
    expect(screen.queryByText('🎤 Go to Artist')).not.toBeInTheDocument();
    expect(screen.getByText('💿 Go to Album')).toBeInTheDocument();
  });

  test('clicking Go to Album navigates, closes the menu, and closes the drawer, without also activating the row', () => {
    const navigate = vi.fn();
    useNavigate.mockReturnValue(navigate);
    const closeDrawer = vi.fn();
    usePlayerStore.setState({ closeDrawer });
    const onActivate = vi.fn();
    renderRow({ onActivate });
    fireEvent.contextMenu(screen.getByText(/Track 1/).closest('.track-item'));

    fireEvent.click(screen.getByText('💿 Go to Album'));

    expect(navigate).toHaveBeenCalledWith('/album/20');
    expect(closeDrawer).toHaveBeenCalled();
    expect(screen.queryByText('💿 Go to Album')).not.toBeInTheDocument();
    expect(onActivate).not.toHaveBeenCalled();
  });

  test('clicking Go to Artist navigates, closes the menu, and closes the drawer, without also activating the row', () => {
    const navigate = vi.fn();
    useNavigate.mockReturnValue(navigate);
    const closeDrawer = vi.fn();
    usePlayerStore.setState({ closeDrawer });
    const onActivate = vi.fn();
    renderRow({ onActivate });
    fireEvent.contextMenu(screen.getByText(/Track 1/).closest('.track-item'));

    fireEvent.click(screen.getByText('🎤 Go to Artist'));

    expect(navigate).toHaveBeenCalledWith('/artist/5');
    expect(closeDrawer).toHaveBeenCalled();
    expect(onActivate).not.toHaveBeenCalled();
  });

  test('a long-press on mobile does not also trigger tap-to-play once the menu opens', () => {
    vi.useFakeTimers();
    const onTouchEndRow = vi.fn(() => vi.fn());
    renderRow({ mobile: true, onTouchEndRow });
    const row = screen.getByText(/Track 1/).closest('.track-item');

    fireEvent.touchStart(row, { touches: [{ clientX: 50, clientY: 50 }] });
    act(() => { vi.advanceTimersByTime(500); });
    expect(screen.getByText('💿 Go to Album')).toBeInTheDocument();

    fireEvent.touchEnd(row, { changedTouches: [{ clientX: 50, clientY: 50 }] });
    expect(onTouchEndRow).not.toHaveBeenCalled();

    vi.useRealTimers();
  });

  test('a short tap on mobile still plays the track normally (no menu interference)', () => {
    const onTouchEndRow = vi.fn(() => vi.fn());
    renderRow({ mobile: true, index: 3, onTouchEndRow });
    const row = screen.getByText(/Track 1/).closest('.track-item');

    fireEvent.touchStart(row, { touches: [{ clientX: 50, clientY: 50 }] });
    fireEvent.touchEnd(row, { changedTouches: [{ clientX: 50, clientY: 50 }] });

    expect(onTouchEndRow).toHaveBeenCalledWith(3);
    expect(screen.queryByText('💿 Go to Album')).not.toBeInTheDocument();
  });

  test('the delete button does not open the context menu', () => {
    renderRow();
    const deleteButton = screen.getByRole('button', { name: 'Remove track from playlist' });
    fireEvent.contextMenu(deleteButton);
    expect(screen.queryByText('💿 Go to Album')).not.toBeInTheDocument();
  });

  test('the menu does not open at all when both items would be suppressed', () => {
    renderRow({ track: track(1, { album: null, artist: { id: null, name: 'Orphan' } }) });
    fireEvent.contextMenu(screen.getByText(/Track 1/).closest('.track-item'));
    expect(document.querySelector('.track-dropdown')).not.toBeInTheDocument();
  });

  test('right-click opens a menu with Go to Playlist when the track has a source_playlist', () => {
    renderRow({ track: track(1, { source_playlist: { id: 9, name: 'Chill Mix' } }) });
    fireEvent.contextMenu(screen.getByText(/Track 1/).closest('.track-item'));
    expect(screen.getByText('📃 Go to Playlist')).toBeInTheDocument();
  });

  test('Go to Playlist is absent when the track has no source_playlist', () => {
    renderRow();
    fireEvent.contextMenu(screen.getByText(/Track 1/).closest('.track-item'));
    expect(screen.queryByText('📃 Go to Playlist')).not.toBeInTheDocument();
  });

  test('Go to Playlist is absent when already on that playlist\'s page', () => {
    renderRow({ track: track(1, { source_playlist: { id: 9, name: 'Chill Mix' } }) }, '/playlist/9');
    fireEvent.contextMenu(screen.getByText(/Track 1/).closest('.track-item'));
    expect(screen.queryByText('📃 Go to Playlist')).not.toBeInTheDocument();
    // Album/Artist items are unaffected by being on the playlist page
    expect(screen.getByText('💿 Go to Album')).toBeInTheDocument();
  });

  test('clicking Go to Playlist navigates, closes the menu, and closes the drawer, without also activating the row', () => {
    const navigate = vi.fn();
    useNavigate.mockReturnValue(navigate);
    const closeDrawer = vi.fn();
    usePlayerStore.setState({ closeDrawer });
    const onActivate = vi.fn();
    renderRow({ track: track(1, { source_playlist: { id: 9, name: 'Chill Mix' } }), onActivate });
    fireEvent.contextMenu(screen.getByText(/Track 1/).closest('.track-item'));

    fireEvent.click(screen.getByText('📃 Go to Playlist'));

    expect(navigate).toHaveBeenCalledWith('/playlist/9');
    expect(closeDrawer).toHaveBeenCalled();
    expect(screen.queryByText('📃 Go to Playlist')).not.toBeInTheDocument();
    expect(onActivate).not.toHaveBeenCalled();
  });

  test('the menu still opens for a track whose only applicable item is Go to Playlist', () => {
    renderRow({
      track: track(1, { album: null, artist: { id: null, name: 'Orphan' }, source_playlist: { id: 9, name: 'Chill Mix' } }),
    });
    fireEvent.contextMenu(screen.getByText(/Track 1/).closest('.track-item'));
    expect(screen.getByText('📃 Go to Playlist')).toBeInTheDocument();
  });
});

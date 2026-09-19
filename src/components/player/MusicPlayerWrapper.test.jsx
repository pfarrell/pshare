import { render, screen, fireEvent } from '@testing-library/react';
import MusicPlayerWrapper from './MusicPlayerWrapper';
import { usePlayerStore } from '../../stores/playerStore';
import { useAuthStore } from '../../stores/authStore';

vi.mock('./PlaylistDrawer', () => ({ default: () => null }));
vi.mock('./SavePlaylistModal', () => ({
  default: ({ onClose }) => (
    <div data-testid="save-playlist-modal">
      <button onClick={onClose}>mock-close</button>
    </div>
  ),
}));

beforeEach(() => {
  usePlayerStore.setState({
    audioElementA: null, audioElementB: null, activeSlot: 'a', isPlaying: false, isBuffering: false, currentTime: 0, duration: 0,
    playbackMode: 'off', queueSource: null, drawerOpen: false, activityPulseToken: 0, playlist: [], currentTrackIndex: -1,
  });
  useAuthStore.setState({ isAuthenticated: true });
});

test('renders two hidden audio elements and binds both into the store', () => {
  render(<MusicPlayerWrapper />);
  expect(usePlayerStore.getState().audioElementA).not.toBeNull();
  expect(usePlayerStore.getState().audioElementB).not.toBeNull();
});

test('play button calls togglePlayPause', () => {
  const togglePlayPause = vi.fn();
  usePlayerStore.setState({ togglePlayPause });
  render(<MusicPlayerWrapper />);
  fireEvent.click(screen.getByTitle('Play/Pause'));
  expect(togglePlayPause).toHaveBeenCalled();
});

test('next/prev buttons call playNext/playPrev', () => {
  const playNext = vi.fn();
  const playPrev = vi.fn();
  usePlayerStore.setState({ playNext, playPrev });
  render(<MusicPlayerWrapper />);
  fireEvent.click(screen.getByTitle('Next'));
  fireEvent.click(screen.getByTitle('Previous'));
  expect(playNext).toHaveBeenCalled();
  expect(playPrev).toHaveBeenCalled();
});

test('next button calls playNext with manual: true', () => {
  const playNext = vi.fn();
  usePlayerStore.setState({ playNext });
  render(<MusicPlayerWrapper />);
  fireEvent.click(screen.getByTitle('Next'));
  expect(playNext).toHaveBeenCalledWith({ manual: true });
});

test('shuffle button shows the off glyph and calls cyclePlaybackMode', () => {
  const cyclePlaybackMode = vi.fn();
  usePlayerStore.setState({ playbackMode: 'off', cyclePlaybackMode });
  render(<MusicPlayerWrapper />);
  const button = screen.getByTitle('Shuffle: Off');
  expect(button).not.toHaveClass('active');
  fireEvent.click(button);
  expect(cyclePlaybackMode).toHaveBeenCalled();
});

test('shuffle button shows the shuffle glyph and title when active', () => {
  usePlayerStore.setState({ playbackMode: 'shuffle' });
  render(<MusicPlayerWrapper />);
  const button = screen.getByTitle('Shuffle');
  expect(button).toHaveClass('active');
  expect(button.textContent).toBe('\u{1F500}');
});

test('shuffle button shows a distinct glyph and a "Shuffle Collection" title for shuffle-scope with a collection queueSource', () => {
  usePlayerStore.setState({ playbackMode: 'shuffle-scope', queueSource: { type: 'collection', id: 7 } });
  render(<MusicPlayerWrapper />);
  const button = screen.getByTitle('Shuffle Collection');
  expect(button).toHaveClass('active');
  expect(button.textContent).toBe('\u{1F3B2}');
  expect(button.textContent).not.toBe('\u{1F500}');
});

test('shuffle button shows a "Shuffle Artist" title for shuffle-scope with an artist queueSource', () => {
  usePlayerStore.setState({ playbackMode: 'shuffle-scope', queueSource: { type: 'artist', id: 3 } });
  render(<MusicPlayerWrapper />);
  const button = screen.getByTitle('Shuffle Artist');
  expect(button).toHaveClass('active');
  expect(button.textContent).toBe('\u{1F3B2}');
});

test('shuffle button shows the repeat-all glyph and title', () => {
  usePlayerStore.setState({ playbackMode: 'repeat-all' });
  render(<MusicPlayerWrapper />);
  const button = screen.getByTitle('Repeat All');
  expect(button).toHaveClass('active');
  expect(button.textContent).toBe('\u{1F501}');
});

test('shuffle button shows the repeat-one glyph and title', () => {
  usePlayerStore.setState({ playbackMode: 'repeat-one' });
  render(<MusicPlayerWrapper />);
  const button = screen.getByTitle('Repeat One');
  expect(button).toHaveClass('active');
  expect(button.textContent).toBe('\u{1F502}');
});

test('hamburger button toggles the drawer', () => {
  const toggleDrawer = vi.fn();
  usePlayerStore.setState({ toggleDrawer });
  render(<MusicPlayerWrapper />);
  fireEvent.click(screen.getByTitle('Toggle Playlist'));
  expect(toggleDrawer).toHaveBeenCalled();
});

test('progress bar shows the loading class while buffering', () => {
  usePlayerStore.setState({ isBuffering: true });
  render(<MusicPlayerWrapper />);
  expect(document.querySelector('.progress-bar-wrapper')).toHaveClass('loading');
});

test('seeking the range input calls seek with the corresponding time', () => {
  const seek = vi.fn();
  usePlayerStore.setState({ duration: 200, seek });
  render(<MusicPlayerWrapper />);
  fireEvent.change(screen.getByRole('slider'), { target: { value: '50' } });
  expect(seek).toHaveBeenCalledWith(100); // 50% of 200s
});

test('right-click on the hamburger icon opens the Save as Playlist menu when the queue has tracks', () => {
  usePlayerStore.setState({ playlist: [{ id: 1 }] });
  render(<MusicPlayerWrapper />);
  fireEvent.contextMenu(screen.getByTitle('Toggle Playlist'));
  expect(screen.getByText('💾 Save as Playlist')).toBeInTheDocument();
});

test('Save as Playlist is not offered when the queue is empty', () => {
  usePlayerStore.setState({ playlist: [] });
  render(<MusicPlayerWrapper />);
  fireEvent.contextMenu(screen.getByTitle('Toggle Playlist'));
  expect(screen.queryByText('💾 Save as Playlist')).not.toBeInTheDocument();
});

test('Save as Playlist is not offered when logged out, even with tracks in the queue', () => {
  useAuthStore.setState({ isAuthenticated: false });
  usePlayerStore.setState({ playlist: [{ id: 1 }] });
  render(<MusicPlayerWrapper />);
  fireEvent.contextMenu(screen.getByTitle('Toggle Playlist'));
  expect(screen.queryByText('💾 Save as Playlist')).not.toBeInTheDocument();
});

test('the menu does not open on right-click when the queue is empty', () => {
  usePlayerStore.setState({ playlist: [] });
  render(<MusicPlayerWrapper />);
  fireEvent.contextMenu(screen.getByTitle('Toggle Playlist'));
  expect(screen.queryByText('🗑 Clear Playlist')).not.toBeInTheDocument();
});

test('Clear Playlist is offered even when logged out, as long as the queue has tracks', () => {
  useAuthStore.setState({ isAuthenticated: false });
  usePlayerStore.setState({ playlist: [{ id: 1 }] });
  render(<MusicPlayerWrapper />);
  fireEvent.contextMenu(screen.getByTitle('Toggle Playlist'));
  expect(screen.getByText('🗑 Clear Playlist')).toBeInTheDocument();
});

test('clicking Clear Playlist calls clearPlaylist after the user confirms', () => {
  const clearPlaylist = vi.fn();
  usePlayerStore.setState({ playlist: [{ id: 1 }, { id: 2 }], clearPlaylist });
  vi.spyOn(window, 'confirm').mockReturnValue(true);
  render(<MusicPlayerWrapper />);
  fireEvent.contextMenu(screen.getByTitle('Toggle Playlist'));

  fireEvent.click(screen.getByText('🗑 Clear Playlist'));

  expect(window.confirm).toHaveBeenCalled();
  expect(clearPlaylist).toHaveBeenCalled();
  expect(screen.queryByText('🗑 Clear Playlist')).not.toBeInTheDocument();
  window.confirm.mockRestore();
});

test('declining the confirmation leaves the queue untouched', () => {
  const clearPlaylist = vi.fn();
  usePlayerStore.setState({ playlist: [{ id: 1 }], clearPlaylist });
  vi.spyOn(window, 'confirm').mockReturnValue(false);
  render(<MusicPlayerWrapper />);
  fireEvent.contextMenu(screen.getByTitle('Toggle Playlist'));

  fireEvent.click(screen.getByText('🗑 Clear Playlist'));

  expect(clearPlaylist).not.toHaveBeenCalled();
  window.confirm.mockRestore();
});

test('confirming Clear Playlist closes the drawer', () => {
  usePlayerStore.setState({ playlist: [{ id: 1 }], clearPlaylist: vi.fn(), drawerOpen: true });
  vi.spyOn(window, 'confirm').mockReturnValue(true);
  render(<MusicPlayerWrapper />);
  fireEvent.contextMenu(screen.getByTitle('Toggle Playlist'));

  fireEvent.click(screen.getByText('🗑 Clear Playlist'));

  expect(usePlayerStore.getState().drawerOpen).toBe(false);
  window.confirm.mockRestore();
});

test('declining Clear Playlist still closes the drawer', () => {
  usePlayerStore.setState({ playlist: [{ id: 1 }], clearPlaylist: vi.fn(), drawerOpen: true });
  vi.spyOn(window, 'confirm').mockReturnValue(false);
  render(<MusicPlayerWrapper />);
  fireEvent.contextMenu(screen.getByTitle('Toggle Playlist'));

  fireEvent.click(screen.getByText('🗑 Clear Playlist'));

  expect(usePlayerStore.getState().drawerOpen).toBe(false);
  window.confirm.mockRestore();
});

test('clicking Save as Playlist opens the save modal and closes the menu', () => {
  usePlayerStore.setState({ playlist: [{ id: 1 }, { id: 2 }] });
  render(<MusicPlayerWrapper />);
  fireEvent.contextMenu(screen.getByTitle('Toggle Playlist'));
  fireEvent.click(screen.getByText('💾 Save as Playlist'));
  expect(screen.getByTestId('save-playlist-modal')).toBeInTheDocument();
  expect(screen.queryByText('💾 Save as Playlist')).not.toBeInTheDocument();
});

test('closing the save modal removes it from the DOM', () => {
  usePlayerStore.setState({ playlist: [{ id: 1 }] });
  render(<MusicPlayerWrapper />);
  fireEvent.contextMenu(screen.getByTitle('Toggle Playlist'));
  fireEvent.click(screen.getByText('💾 Save as Playlist'));
  fireEvent.click(screen.getByText('mock-close'));
  expect(screen.queryByTestId('save-playlist-modal')).not.toBeInTheDocument();
});

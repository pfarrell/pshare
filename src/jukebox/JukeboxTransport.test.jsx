import { render, screen, fireEvent, act } from '@testing-library/react';
import { vi } from 'vitest';
import JukeboxTransport from './JukeboxTransport';

vi.mock('../stores/playerStore', () => ({ usePlayerStore: vi.fn() }));
import { usePlayerStore } from '../stores/playerStore';

const actions = {
  togglePlayPause: vi.fn(),
  playNext: vi.fn(),
  playPrev: vi.fn(),
  cyclePlaybackMode: vi.fn(),
  seek: vi.fn(),
  clearPlaylist: vi.fn(),
};

const setState = (overrides = {}) =>
  usePlayerStore.mockImplementation((selector) => selector({
    isPlaying: false,
    currentTime: 0,
    duration: 0,
    playbackMode: 'off',
    queueSource: null,
    playlist: [{ id: 1 }],
    ...actions,
    ...overrides,
  }));

beforeEach(() => {
  vi.clearAllMocks();
  setState();
});

afterEach(() => {
  vi.useRealTimers();
});

test('play/pause toggles playback and its label follows isPlaying', () => {
  const { unmount } = render(<JukeboxTransport />);
  fireEvent.click(screen.getByRole('button', { name: 'Play' }));
  expect(actions.togglePlayPause).toHaveBeenCalledTimes(1);
  unmount();

  setState({ isPlaying: true });
  render(<JukeboxTransport />);
  expect(screen.getByRole('button', { name: 'Pause' })).toBeInTheDocument();
});

test('previous calls playPrev and next calls playNext as a manual skip', () => {
  render(<JukeboxTransport />);
  fireEvent.click(screen.getByRole('button', { name: 'Previous' }));
  fireEvent.click(screen.getByRole('button', { name: 'Next' }));
  expect(actions.playPrev).toHaveBeenCalledTimes(1);
  expect(actions.playNext).toHaveBeenCalledWith({ manual: true });
});

test('the mode button shows the current mode and cycles it on tap', () => {
  render(<JukeboxTransport />);
  fireEvent.click(screen.getByRole('button', { name: 'Shuffle: Off' }));
  expect(actions.cyclePlaybackMode).toHaveBeenCalledTimes(1);
});

test('shuffle-scope names its scope from the queue source', () => {
  setState({ playbackMode: 'shuffle-scope', queueSource: { type: 'artist', id: 4 } });
  render(<JukeboxTransport />);
  expect(screen.getByRole('button', { name: 'Shuffle Artist' })).toBeInTheDocument();
});

test('shows elapsed and total time', () => {
  setState({ currentTime: 65, duration: 200 });
  render(<JukeboxTransport />);
  expect(screen.getByText('1:05')).toBeInTheDocument();
  expect(screen.getByText('3:20')).toBeInTheDocument();
});

test('the seek slider reflects progress and seeks to the chosen fraction of the duration', () => {
  setState({ currentTime: 50, duration: 200 });
  render(<JukeboxTransport />);
  const slider = screen.getByRole('slider', { name: 'Seek' });
  expect(slider).toHaveValue('25');

  fireEvent.change(slider, { target: { value: '50' } });

  expect(actions.seek).toHaveBeenCalledWith(100);
});

test('the seek slider sits at 0 when nothing is loaded', () => {
  render(<JukeboxTransport />);
  expect(screen.getByRole('slider', { name: 'Seek' })).toHaveValue('0');
});

test('Clear queue needs a second tap to confirm', () => {
  render(<JukeboxTransport />);

  fireEvent.click(screen.getByRole('button', { name: 'Clear queue' }));
  expect(actions.clearPlaylist).not.toHaveBeenCalled();
  expect(screen.getByRole('button', { name: 'Tap again to clear' })).toBeInTheDocument();

  fireEvent.click(screen.getByRole('button', { name: 'Tap again to clear' }));
  expect(actions.clearPlaylist).toHaveBeenCalledTimes(1);
  expect(screen.getByRole('button', { name: 'Clear queue' })).toBeInTheDocument();
});

test('an armed Clear queue disarms itself after 3 seconds without clearing', () => {
  vi.useFakeTimers();
  render(<JukeboxTransport />);

  fireEvent.click(screen.getByRole('button', { name: 'Clear queue' }));
  expect(screen.getByRole('button', { name: 'Tap again to clear' })).toBeInTheDocument();

  act(() => { vi.advanceTimersByTime(3000); });

  expect(screen.getByRole('button', { name: 'Clear queue' })).toBeInTheDocument();
  expect(actions.clearPlaylist).not.toHaveBeenCalled();
});

test('Clear queue is disabled when the queue is empty', () => {
  setState({ playlist: [] });
  render(<JukeboxTransport />);
  expect(screen.getByRole('button', { name: 'Clear queue' })).toBeDisabled();
});

import { render, screen, fireEvent, act } from '@testing-library/react';
import { vi } from 'vitest';
import JukeboxFooterStrip from './JukeboxFooterStrip';

vi.mock('./JukeboxProgressLine', () => ({ default: () => <div data-testid="progress-line" /> }));
vi.mock('../stores/playerStore', () => ({ usePlayerStore: vi.fn() }));

import { usePlayerStore } from '../stores/playerStore';

const actions = {
  playPrev: vi.fn(),
  playNext: vi.fn(),
  togglePlayPause: vi.fn(),
};

const setState = (overrides = {}) =>
  usePlayerStore.mockImplementation((selector) => selector({
    isPlaying: false,
    ...actions,
    ...overrides,
  }));

beforeEach(() => {
  vi.clearAllMocks();
  setState();
});

test('renders the progress line', () => {
  render(<JukeboxFooterStrip onOpenQueue={vi.fn()} />);
  expect(screen.getByTestId('progress-line')).toBeInTheDocument();
});

test('previous calls playPrev and next calls playNext as a manual skip', () => {
  render(<JukeboxFooterStrip onOpenQueue={vi.fn()} />);
  fireEvent.click(screen.getByRole('button', { name: 'Previous' }));
  fireEvent.click(screen.getByRole('button', { name: 'Next' }));
  expect(actions.playPrev).toHaveBeenCalledTimes(1);
  expect(actions.playNext).toHaveBeenCalledWith({ manual: true });
});

test('play/pause toggles playback and its label follows isPlaying', () => {
  const { unmount } = render(<JukeboxFooterStrip onOpenQueue={vi.fn()} />);
  fireEvent.click(screen.getByRole('button', { name: 'Play' }));
  expect(actions.togglePlayPause).toHaveBeenCalledTimes(1);
  unmount();

  setState({ isPlaying: true });
  render(<JukeboxFooterStrip onOpenQueue={vi.fn()} />);
  expect(screen.getByRole('button', { name: 'Pause' })).toBeInTheDocument();
});

test('tapping the queue button reports it', () => {
  const onOpenQueue = vi.fn();
  render(<JukeboxFooterStrip onOpenQueue={onOpenQueue} />);

  fireEvent.click(screen.getByRole('button', { name: 'Open queue' }));

  expect(onOpenQueue).toHaveBeenCalledTimes(1);
});

test('the settings gear calls onOpenSettings and is compact', () => {
  const onOpenSettings = vi.fn();
  render(<JukeboxFooterStrip onOpenQueue={vi.fn()} onOpenSettings={onOpenSettings} />);
  const gear = screen.getByRole('button', { name: 'Settings' });
  fireEvent.click(gear);
  expect(onOpenSettings).toHaveBeenCalledTimes(1);
  expect(gear).toHaveClass('jukebox-footer-gear');
});

describe('buffering spinner', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  test('is hidden when not buffering', () => {
    render(<JukeboxFooterStrip onOpenQueue={vi.fn()} />);
    act(() => { vi.advanceTimersByTime(2000); });
    expect(screen.queryByTestId('play-spinner')).not.toBeInTheDocument();
  });

  test('appears only after the delay, and play stays clickable', () => {
    setState({ isBuffering: true });
    render(<JukeboxFooterStrip onOpenQueue={vi.fn()} />);
    expect(screen.queryByTestId('play-spinner')).not.toBeInTheDocument();
    act(() => { vi.advanceTimersByTime(500); });
    expect(screen.getByTestId('play-spinner')).toBeInTheDocument();
    const btn = screen.getByRole('button', { name: 'Play' });
    expect(btn).toBeEnabled();
    fireEvent.click(btn);
    expect(actions.togglePlayPause).toHaveBeenCalledTimes(1);
  });

  test('goes away when buffering ends', () => {
    setState({ isBuffering: true });
    const { rerender } = render(<JukeboxFooterStrip onOpenQueue={vi.fn()} />);
    act(() => { vi.advanceTimersByTime(500); });
    setState({ isBuffering: false });
    rerender(<JukeboxFooterStrip onOpenQueue={vi.fn()} />);
    expect(screen.queryByTestId('play-spinner')).not.toBeInTheDocument();
  });
});

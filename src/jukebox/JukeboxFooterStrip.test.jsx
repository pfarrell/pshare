import { render, screen, fireEvent } from '@testing-library/react';
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

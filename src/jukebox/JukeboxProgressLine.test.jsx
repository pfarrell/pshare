import { render, screen } from '@testing-library/react';
import { vi } from 'vitest';
import JukeboxProgressLine from './JukeboxProgressLine';

vi.mock('../stores/playerStore', () => ({ usePlayerStore: vi.fn() }));
import { usePlayerStore } from '../stores/playerStore';

const setTimes = (currentTime, duration) =>
  usePlayerStore.mockImplementation((selector) => selector({ currentTime, duration }));

const fillWidth = () => screen.getByRole('progressbar').querySelector('.jukebox-progress-line-fill').style.width;

test('fills in proportion to currentTime / duration', () => {
  setTimes(50, 200);
  render(<JukeboxProgressLine />);
  expect(fillWidth()).toBe('25%');
  expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '25');
});

test('is empty when nothing is loaded (duration 0)', () => {
  setTimes(0, 0);
  render(<JukeboxProgressLine />);
  expect(fillWidth()).toBe('0%');
  expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '0');
});

test('is empty when duration is not a finite number', () => {
  setTimes(10, NaN);
  render(<JukeboxProgressLine />);
  expect(fillWidth()).toBe('0%');
});

test('never exceeds 100% or goes below 0%', () => {
  setTimes(500, 200);
  const { unmount } = render(<JukeboxProgressLine />);
  expect(fillWidth()).toBe('100%');
  unmount();

  setTimes(-5, 200);
  render(<JukeboxProgressLine />);
  expect(fillWidth()).toBe('0%');
});

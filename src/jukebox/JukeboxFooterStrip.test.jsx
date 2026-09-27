import { render, screen, fireEvent } from '@testing-library/react';
import { vi } from 'vitest';
import JukeboxFooterStrip from './JukeboxFooterStrip';

vi.mock('./JukeboxProgressLine', () => ({ default: () => <div data-testid="progress-line" /> }));

test('renders the progress line', () => {
  render(<JukeboxFooterStrip onTap={vi.fn()} />);
  expect(screen.getByTestId('progress-line')).toBeInTheDocument();
});

test('tapping the strip reports the tap', () => {
  const onTap = vi.fn();
  render(<JukeboxFooterStrip onTap={onTap} />);

  fireEvent.click(screen.getByRole('button', { name: 'Browse' }));

  expect(onTap).toHaveBeenCalledTimes(1);
});

import { render, screen, fireEvent } from '@testing-library/react';
import { vi } from 'vitest';
import JukeboxBrowsePanel from './JukeboxBrowsePanel';

vi.mock('./QuickHitTab', () => ({ default: () => <div data-testid="quick-hit-tab" /> }));
vi.mock('./SearchTab', () => ({ default: () => <div data-testid="search-tab" /> }));

test('renders the Quick Hit tab by default', () => {
  render(<JukeboxBrowsePanel onClose={vi.fn()} />);
  expect(screen.getByTestId('quick-hit-tab')).toBeInTheDocument();
});

test('calls onClose when the close button is tapped', () => {
  const onClose = vi.fn();
  render(<JukeboxBrowsePanel onClose={onClose} />);
  fireEvent.click(screen.getByRole('button', { name: 'Close' }));
  expect(onClose).toHaveBeenCalled();
});

test('switches to the Search tab', () => {
  render(<JukeboxBrowsePanel onClose={vi.fn()} />);
  fireEvent.click(screen.getByRole('button', { name: 'Search' }));
  expect(screen.getByTestId('search-tab')).toBeInTheDocument();
  expect(screen.queryByTestId('quick-hit-tab')).not.toBeInTheDocument();
});

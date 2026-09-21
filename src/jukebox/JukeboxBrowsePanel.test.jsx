import { render, screen, fireEvent } from '@testing-library/react';
import { vi } from 'vitest';
import JukeboxBrowsePanel from './JukeboxBrowsePanel';

vi.mock('./QuickHitTab', () => ({ default: () => <div data-testid="quick-hit-tab" /> }));

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

import { render, screen, fireEvent } from '@testing-library/react';
import { vi } from 'vitest';
import JukeboxTabBar from './JukeboxTabBar';

vi.mock('./JukeboxProgressLine', () => ({ default: () => <div data-testid="progress-line" /> }));

const renderBar = (props = {}) => render(<JukeboxTabBar activeTab={null} onTabPress={vi.fn()} {...props} />);

test('renders the two tabs in order', () => {
  renderBar();
  expect(screen.getAllByRole('button').map((b) => b.textContent)).toEqual(['Browse', 'Next Up']);
});

test('marks only the active tab as pressed', () => {
  renderBar({ activeTab: 'browse' });
  expect(screen.getByRole('button', { name: 'Browse' })).toHaveAttribute('aria-pressed', 'true');
  expect(screen.getByRole('button', { name: 'Next Up' })).toHaveAttribute('aria-pressed', 'false');
});

test('no tab is pressed when the drawer is closed', () => {
  renderBar({ activeTab: null });
  screen.getAllByRole('button').forEach((b) => expect(b).toHaveAttribute('aria-pressed', 'false'));
});

test('tapping a tab reports its key', () => {
  const onTabPress = vi.fn();
  renderBar({ onTabPress });

  fireEvent.click(screen.getByRole('button', { name: 'Browse' }));
  fireEvent.click(screen.getByRole('button', { name: 'Next Up' }));

  expect(onTabPress.mock.calls.map((c) => c[0])).toEqual(['browse', 'nextup']);
});

test('includes the progress line', () => {
  renderBar();
  expect(screen.getByTestId('progress-line')).toBeInTheDocument();
});

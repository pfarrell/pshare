import { render, screen, fireEvent } from '@testing-library/react';
import { vi } from 'vitest';
import JukeboxTabBar from './JukeboxTabBar';

vi.mock('./JukeboxProgressLine', () => ({ default: () => <div data-testid="progress-line" /> }));
vi.mock('../services/api', () => ({ apiService: { getProfiles: vi.fn() } }));

const renderBar = (props = {}) => render(<JukeboxTabBar activeTab={null} onTabPress={vi.fn()} {...props} />);

// The gear (JukeboxProfilePicker) doesn't fetch anything until tapped open
// (see JukeboxProfilePicker.jsx), so no apiService.getProfiles mock value is
// needed for these tests — only its presence as a third, non-tab button.
const tabButtons = () => screen.getAllByRole('button', { name: /^(Browse|Next Up)$/ });

test('renders the two tabs in order', () => {
  renderBar();
  expect(tabButtons().map((b) => b.textContent)).toEqual(['Browse', 'Next Up']);
});

test('marks only the active tab as pressed', () => {
  renderBar({ activeTab: 'browse' });
  expect(screen.getByRole('button', { name: 'Browse' })).toHaveAttribute('aria-pressed', 'true');
  expect(screen.getByRole('button', { name: 'Next Up' })).toHaveAttribute('aria-pressed', 'false');
});

test('no tab is pressed when the drawer is closed', () => {
  renderBar({ activeTab: null });
  tabButtons().forEach((b) => expect(b).toHaveAttribute('aria-pressed', 'false'));
});

test('renders the settings gear as a third, distinct control', () => {
  renderBar();
  const gear = screen.getByRole('button', { name: /profile settings/i });
  expect(gear).toBeInTheDocument();
  // Not one of the two tabs, and carries no aria-pressed — it's a
  // settings/filter control, not a browse destination.
  expect(tabButtons()).not.toContain(gear);
  expect(gear).not.toHaveAttribute('aria-pressed');
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

test('the settings gear sits on the left, before the tabs', () => {
  renderBar();
  const gear = screen.getByRole('button', { name: /profile settings/i });
  const [firstTab] = tabButtons();
  // DOCUMENT_POSITION_FOLLOWING (4): firstTab comes after the gear.
  expect(gear.compareDocumentPosition(firstTab) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
});

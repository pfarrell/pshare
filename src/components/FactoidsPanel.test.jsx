// src/components/FactoidsPanel.test.jsx
import { render, screen, fireEvent, act } from '@testing-library/react';
import { vi } from 'vitest';
import FactoidsPanel from './FactoidsPanel';

vi.mock('../services/api', () => ({
  apiService: {
    adminListFactoids: vi.fn(),
    adminDeleteFactoid: vi.fn(),
    adminClearFactoidGeneration: vi.fn(),
  },
}));

import { apiService } from '../services/api';

const factoid = (over = {}) => ({
  id: 1, kind: 'album', target_id: 10,
  text: 'The solo was cut in a single take.',
  source_url: 'https://www.rollingstone.com/story', source_title: 'Rolling Stone', ...over,
});

beforeEach(() => {
  vi.clearAllMocks();
  apiService.adminListFactoids.mockResolvedValue({
    data: { factoids: [factoid()], generation: { id: 7, status: 'ok', attempts: 1, factoid_count: 1, error: null } },
  });
  apiService.adminDeleteFactoid.mockResolvedValue({ data: { success: true } });
  apiService.adminClearFactoidGeneration.mockResolvedValue({ data: { success: true } });
});

test('lists the entity factoids with their source link', async () => {
  render(<FactoidsPanel kind="album" targetId={10} />);
  await act(async () => {});

  expect(apiService.adminListFactoids).toHaveBeenCalledWith('album', 10);
  expect(screen.getByText('The solo was cut in a single take.')).toBeInTheDocument();
  expect(screen.getByRole('link', { name: /Rolling Stone/ }))
    .toHaveAttribute('href', 'https://www.rollingstone.com/story');
});

test('deleting a factoid removes it from the list', async () => {
  render(<FactoidsPanel kind="album" targetId={10} />);
  await act(async () => {});

  fireEvent.click(screen.getByRole('button', { name: /delete/i }));
  await act(async () => {});

  expect(apiService.adminDeleteFactoid).toHaveBeenCalledWith(1);
  expect(screen.queryByText('The solo was cut in a single take.')).not.toBeInTheDocument();
});

test('re-research clears the ledger row and refetches', async () => {
  render(<FactoidsPanel kind="album" targetId={10} />);
  await act(async () => {});

  fireEvent.click(screen.getByRole('button', { name: /research/i }));
  await act(async () => {});

  expect(apiService.adminClearFactoidGeneration).toHaveBeenCalledWith('album', 10);
  expect(apiService.adminListFactoids).toHaveBeenCalledTimes(2);
});

test('shows an empty state rather than a bare heading', async () => {
  apiService.adminListFactoids.mockResolvedValue({ data: { factoids: [], generation: null } });
  render(<FactoidsPanel kind="album" targetId={10} />);
  await act(async () => {});

  expect(screen.getByText(/no factoids/i)).toBeInTheDocument();
});

test('a failed request shows an error instead of crashing', async () => {
  apiService.adminListFactoids.mockRejectedValue(new Error('nope'));
  render(<FactoidsPanel kind="album" targetId={10} />);
  await act(async () => {});

  expect(screen.getByText(/could not load/i)).toBeInTheDocument();
});

test('renders a malformed row without throwing', async () => {
  apiService.adminListFactoids.mockResolvedValue({
    data: { factoids: [{ id: 2, text: 'Bare fact.' }], generation: null },
  });
  render(<FactoidsPanel kind="album" targetId={10} />);
  await act(async () => {});

  expect(screen.getByText('Bare fact.')).toBeInTheDocument();
});

test('does not fetch without a targetId', async () => {
  render(<FactoidsPanel kind="album" targetId={null} />);
  await act(async () => {});

  expect(apiService.adminListFactoids).not.toHaveBeenCalled();
});

test('a link with a javascript: url is not rendered as a clickable href', async () => {
  // source_url is validated https-only on the way in, but this panel is the one
  // place a stored url becomes a live link, so it must not trust the row.
  apiService.adminListFactoids.mockResolvedValue({
    data: { factoids: [factoid({ source_url: 'javascript:alert(1)', source_title: 'Evil' })], generation: null },
  });
  render(<FactoidsPanel kind="album" targetId={10} />);
  await act(async () => {});

  expect(screen.queryByRole('link', { name: /Evil/ })).not.toBeInTheDocument();
  expect(screen.getByText('The solo was cut in a single take.')).toBeInTheDocument();
});

test('a failed delete keeps the row and shows an error', async () => {
  apiService.adminDeleteFactoid.mockRejectedValue(new Error('boom'));
  render(<FactoidsPanel kind="album" targetId={10} />);
  await act(async () => {});

  fireEvent.click(screen.getByRole('button', { name: /delete/i }));
  await act(async () => {});

  // The list must not lie: a delete that failed leaves the factoid on screen.
  expect(screen.getByText('The solo was cut in a single take.')).toBeInTheDocument();
  expect(screen.getByText(/could not/i)).toBeInTheDocument();
});

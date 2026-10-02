import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter, useNavigate } from 'react-router-dom';
import Playlists from './Playlists';
import { apiService } from '../services/api';
import { usePlaylistSortStore } from '../stores/playlistSortStore';

vi.mock('../services/api', () => ({
  apiService: {
    getPlaylists: vi.fn(),
    getImageUrl: (path) => `http://example.com/${path}`,
  },
}));

vi.mock('react-router-dom', async (importOriginal) => {
  const actual = await importOriginal();
  return { ...actual, useNavigate: vi.fn() };
});

const renderPlaylists = () =>
  render(
    <MemoryRouter>
      <Playlists />
    </MemoryRouter>
  );

// Deliberately chosen so recency order and alphabetical order disagree —
// a test that produces the same expected order either way wouldn't
// distinguish the two sort modes.
const playlists = [
  { id: 1, name: 'Zebra Vibes', image_path: null, updated_at: '2026-08-25T00:00:00Z' },
  { id: 2, name: 'Alpha Mix', image_path: null, updated_at: '2026-08-10T00:00:00Z' },
  { id: 3, name: 'Mid Tempo', image_path: null, updated_at: '2026-08-01T00:00:00Z' },
];

beforeEach(() => {
  vi.clearAllMocks();
  useNavigate.mockReturnValue(vi.fn());
  usePlaylistSortStore.setState({ sortBy: 'recent' });
  apiService.getPlaylists.mockResolvedValue({ data: playlists });
});

describe('Playlists page sorting', () => {
  test('defaults to most-recently-updated order', async () => {
    renderPlaylists();
    const headings = await screen.findAllByRole('heading', { level: 3 });
    expect(headings.map((h) => h.textContent)).toEqual(['Zebra Vibes', 'Alpha Mix', 'Mid Tempo']);
  });

  test('switching to A–Z sorts alphabetically by name', async () => {
    renderPlaylists();
    await screen.findAllByRole('heading', { level: 3 });

    fireEvent.click(screen.getByLabelText('Sort alphabetically'));

    const headings = await screen.findAllByRole('heading', { level: 3 });
    expect(headings.map((h) => h.textContent)).toEqual(['Alpha Mix', 'Mid Tempo', 'Zebra Vibes']);
  });

  test('starting in alpha mode (persisted store) renders alphabetical order immediately', async () => {
    usePlaylistSortStore.setState({ sortBy: 'alpha' });
    renderPlaylists();

    const headings = await screen.findAllByRole('heading', { level: 3 });
    expect(headings.map((h) => h.textContent)).toEqual(['Alpha Mix', 'Mid Tempo', 'Zebra Vibes']);
  });

  test('switching back to Recent restores most-recently-updated order', async () => {
    usePlaylistSortStore.setState({ sortBy: 'alpha' });
    renderPlaylists();
    await screen.findAllByRole('heading', { level: 3 });

    fireEvent.click(screen.getByLabelText('Sort by recently updated'));

    const headings = await screen.findAllByRole('heading', { level: 3 });
    expect(headings.map((h) => h.textContent)).toEqual(['Zebra Vibes', 'Alpha Mix', 'Mid Tempo']);
  });

  // Prod has a playlist whose name is NULL. The page has no error boundary, so
  // a throw while sorting is a white screen; where the null lands relative to
  // the others decides which operand the comparator sees it as, so cover both.
  test.each([
    ['first', [{ id: 9, name: null, image_path: null, updated_at: null }, ...playlists]],
    ['last', [...playlists, { id: 9, name: null, image_path: null, updated_at: null }]],
    ['middle', [playlists[0], { id: 9, name: null, image_path: null, updated_at: null }, playlists[1], playlists[2]]],
  ])('a playlist with a null name (%s) does not crash alphabetical sorting', async (_where, data) => {
    usePlaylistSortStore.setState({ sortBy: 'alpha' });
    apiService.getPlaylists.mockResolvedValue({ data });
    renderPlaylists();

    const headings = await screen.findAllByRole('heading', { level: 3 });
    expect(headings).toHaveLength(4);
    expect(headings.map((h) => h.textContent).filter(Boolean)).toEqual(['Alpha Mix', 'Mid Tempo', 'Zebra Vibes']);
  });
});

import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { vi } from 'vitest';
import QuickHitTab from './QuickHitTab';

vi.mock('../services/api', () => ({
  apiService: {
    getRecentAlbums: vi.fn(),
    getRecentPlaylists: vi.fn(),
    getImageUrl: vi.fn(() => '/img/sm/x.jpg'),
  },
}));

import { apiService } from '../services/api';

beforeEach(() => {
  vi.clearAllMocks();
  apiService.getRecentPlaylists.mockResolvedValue({ data: [] });
});

const renderTab = (props = {}) => render(<MemoryRouter><QuickHitTab onSelectAlbum={vi.fn()} {...props} /></MemoryRouter>);

test('fetches and renders recently-played albums', async () => {
  apiService.getRecentAlbums.mockResolvedValue({
    data: [
      { id: 1, title: 'Album One', image_path: 'a.jpg', artist: { id: 1, name: 'Artist One' }, track_count: 10 },
      { id: 2, title: 'Album Two', image_path: 'b.jpg', artist: { id: 2, name: 'Artist Two' }, track_count: 8 },
    ],
  });
  renderTab();

  await waitFor(() => {
    expect(screen.getByText('Album One')).toBeInTheDocument();
    expect(screen.getByText('Album Two')).toBeInTheDocument();
  });
});

test('renders albums as a vertical grid of plain tiles with no play buttons', async () => {
  apiService.getRecentAlbums.mockResolvedValue({
    data: [
      { id: 1, title: 'Album One', image_path: 'a.jpg', artist: { id: 1, name: 'Artist One' }, track_count: 10 },
      { id: 2, title: 'Album Two', image_path: 'b.jpg', artist: { id: 2, name: 'Artist Two' }, track_count: 8 },
    ],
  });
  const { container } = renderTab();
  await waitFor(() => screen.getByText('Album One'));

  expect(container.querySelector('.jukebox-album-grid')).not.toBeNull();
  expect(container.querySelector('.jukebox-quick-hit-row')).toBeNull();
  // One button per album, and nothing else interactive (no ▶ / ⋯ menu).
  expect(screen.getAllByRole('button')).toHaveLength(2);
  expect(screen.queryByRole('button', { name: /^Play / })).toBeNull();
});

test('tapping an album calls onSelectAlbum with that album', async () => {
  apiService.getRecentAlbums.mockResolvedValue({
    data: [{ id: 1, title: 'Album One', image_path: 'a.jpg', artist: { id: 1, name: 'Artist One' }, track_count: 10 }],
  });
  const onSelectAlbum = vi.fn();
  renderTab({ onSelectAlbum });
  await waitFor(() => screen.getByText('Album One'));

  fireEvent.click(screen.getByText('Album One'));

  expect(onSelectAlbum).toHaveBeenCalledWith(expect.objectContaining({ id: 1, title: 'Album One' }));
});

test('shows an empty-state message when there is no play history yet', async () => {
  apiService.getRecentAlbums.mockResolvedValue({ data: [] });
  renderTab();

  await waitFor(() => {
    expect(screen.getByText('Nothing played yet — try searching for something')).toBeInTheDocument();
  });
});

test('passes profileId through to getRecentAlbums', async () => {
  apiService.getRecentAlbums.mockResolvedValue({ data: [] });
  renderTab({ profileId: 5 });
  await waitFor(() => expect(apiService.getRecentAlbums).toHaveBeenCalledWith(20, 5));
});

test('defaults profileId to null when not provided', async () => {
  apiService.getRecentAlbums.mockResolvedValue({ data: [] });
  renderTab();
  await waitFor(() => expect(apiService.getRecentAlbums).toHaveBeenCalledWith(20, null));
});

test('shows a retry option when fetching recent albums fails, and retry re-fetches', async () => {
  apiService.getRecentAlbums.mockRejectedValueOnce(new Error('network error'));
  renderTab();

  await waitFor(() => {
    expect(screen.getByText('Failed to load albums.')).toBeInTheDocument();
  });

  apiService.getRecentAlbums.mockResolvedValueOnce({
    data: [{ id: 1, title: 'Album One', image_path: 'a.jpg', artist: { id: 1, name: 'Artist One' }, track_count: 10 }],
  });
  fireEvent.click(screen.getByRole('button', { name: 'Retry' }));

  await waitFor(() => {
    expect(screen.getByText('Album One')).toBeInTheDocument();
  });
});

const album = (id, title, last_played) => ({ id, title, image_path: `${id}.jpg`, artist: { id, name: `Artist ${id}` }, track_count: 5, last_played });
const playlist = (id, name, last_played) => ({ id, name, image_path: null, track_count: 7, last_played });
const titlesIn = (container) => [...container.querySelectorAll('.jukebox-album-tile-title')].map((el) => el.textContent);

test('merges recent playlists with recent albums, newest first', async () => {
  apiService.getRecentAlbums.mockResolvedValue({ data: [album(1, 'Album Old', '2026-09-01T00:00:00Z'), album(2, 'Album New', '2026-09-28T00:00:00Z')] });
  apiService.getRecentPlaylists.mockResolvedValue({ data: [playlist(9, 'Sunday Kitchen', '2026-09-15T00:00:00Z')] });
  const { container } = renderTab();

  await waitFor(() => screen.getByText('Sunday Kitchen'));
  expect(titlesIn(container)).toEqual(['Album New', 'Sunday Kitchen', 'Album Old']);
});

test('tapping a playlist tile calls onSelectPlaylist with it', async () => {
  apiService.getRecentAlbums.mockResolvedValue({ data: [] });
  apiService.getRecentPlaylists.mockResolvedValue({ data: [playlist(9, 'Sunday Kitchen', '2026-09-15T00:00:00Z')] });
  const onSelectPlaylist = vi.fn();
  renderTab({ onSelectPlaylist });

  fireEvent.click(await screen.findByText('Sunday Kitchen'));
  expect(onSelectPlaylist).toHaveBeenCalledWith(expect.objectContaining({ id: 9, name: 'Sunday Kitchen' }));
});

test('still shows recent albums when the playlists request fails', async () => {
  apiService.getRecentAlbums.mockResolvedValue({ data: [album(1, 'Album One', '2026-09-01T00:00:00Z')] });
  apiService.getRecentPlaylists.mockRejectedValue(new Error('boom'));
  renderTab();

  await waitFor(() => expect(screen.getByText('Album One')).toBeInTheDocument());
  expect(screen.queryByText(/failed to load/i)).not.toBeInTheDocument();
});

test('shows the empty message only when there are no albums and no playlists', async () => {
  apiService.getRecentAlbums.mockResolvedValue({ data: [] });
  apiService.getRecentPlaylists.mockResolvedValue({ data: [] });
  renderTab();
  await waitFor(() => expect(screen.getByText(/nothing played yet/i)).toBeInTheDocument());
});

test('caps the merged grid at 20 tiles', async () => {
  const many = (n, make, base) => Array.from({ length: n }, (_, i) => make(base + i, `Item ${base + i}`, new Date(Date.UTC(2026, 8, 1, 0, i)).toISOString()));
  apiService.getRecentAlbums.mockResolvedValue({ data: many(20, album, 100) });
  apiService.getRecentPlaylists.mockResolvedValue({ data: many(20, playlist, 200) });
  const { container } = renderTab();
  await waitFor(() => expect(container.querySelectorAll('.jukebox-album-tile').length).toBe(20));
});

test('an album with no last_played sorts after ones that have it, without crashing', async () => {
  apiService.getRecentAlbums.mockResolvedValue({ data: [album(1, 'No Date', undefined), album(2, 'Dated', '2026-09-01T00:00:00Z')] });
  const { container } = renderTab();
  await waitFor(() => screen.getByText('Dated'));
  expect(titlesIn(container)).toEqual(['Dated', 'No Date']);
});

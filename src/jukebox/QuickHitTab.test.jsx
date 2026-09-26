import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { vi } from 'vitest';
import QuickHitTab from './QuickHitTab';

vi.mock('../services/api', () => ({
  apiService: {
    getRecentAlbums: vi.fn(),
    getImageUrl: vi.fn(() => '/img/sm/x.jpg'),
  },
}));

import { apiService } from '../services/api';

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

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
    expect(screen.getByText('Nothing played yet — try Search instead')).toBeInTheDocument();
  });
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

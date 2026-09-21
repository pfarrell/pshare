import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { vi } from 'vitest';
import JukeboxArtistView from './JukeboxArtistView';

vi.mock('../services/api', () => ({
  apiService: {
    getArtist: vi.fn(),
    getImageUrl: vi.fn(() => '/img/sm/x.jpg'),
  },
}));

import { apiService } from '../services/api';

const artist = { id: 5, name: 'Test Artist' };

const renderView = (props = {}) =>
  render(
    <MemoryRouter>
      <JukeboxArtistView artist={artist} onSelectAlbum={vi.fn()} onBack={vi.fn()} {...props} />
    </MemoryRouter>
  );

test('fetches and renders the artist\'s albums', async () => {
  apiService.getArtist.mockResolvedValue({
    data: {
      artist,
      albums: [
        { id: 1, title: 'Album One', image_path: 'a.jpg', track_count: 8 },
        { id: 2, title: 'Album Two', image_path: 'b.jpg', track_count: 10 },
      ],
    },
  });
  renderView();

  await waitFor(() => {
    expect(apiService.getArtist).toHaveBeenCalledWith(5);
    expect(screen.getByText('Album One')).toBeInTheDocument();
    expect(screen.getByText('Album Two')).toBeInTheDocument();
  });
  expect(screen.getByRole('heading', { name: 'Test Artist' })).toBeInTheDocument();
});

test('tapping an album calls onSelectAlbum with that album', async () => {
  apiService.getArtist.mockResolvedValue({
    data: { artist, albums: [{ id: 1, title: 'Album One', image_path: 'a.jpg', track_count: 8 }] },
  });
  const onSelectAlbum = vi.fn();
  renderView({ onSelectAlbum });
  await waitFor(() => screen.getByText('Album One'));

  fireEvent.click(screen.getByText('Album One'));

  expect(onSelectAlbum).toHaveBeenCalledWith(expect.objectContaining({ id: 1, title: 'Album One' }));
});

test('tapping Back calls onBack', () => {
  apiService.getArtist.mockResolvedValue({ data: { artist, albums: [] } });
  const onBack = vi.fn();
  renderView({ onBack });

  fireEvent.click(screen.getByText('‹ Back'));

  expect(onBack).toHaveBeenCalled();
});

test('shows an empty state when the artist has no albums', async () => {
  apiService.getArtist.mockResolvedValue({ data: { artist, albums: [] } });
  renderView();
  await waitFor(() => {
    expect(screen.getByText('No albums found')).toBeInTheDocument();
  });
});

test('shows a retry option when fetching fails, and retry re-fetches', async () => {
  apiService.getArtist.mockRejectedValueOnce(new Error('network error'));
  renderView();

  await waitFor(() => {
    expect(screen.getByText('Failed to load albums.')).toBeInTheDocument();
  });

  apiService.getArtist.mockResolvedValueOnce({
    data: { artist, albums: [{ id: 1, title: 'Album One', image_path: 'a.jpg', track_count: 8 }] },
  });
  fireEvent.click(screen.getByRole('button', { name: 'Retry' }));

  await waitFor(() => {
    expect(screen.getByText('Album One')).toBeInTheDocument();
  });
});

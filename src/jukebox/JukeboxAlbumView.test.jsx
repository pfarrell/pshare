import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { vi } from 'vitest';
import JukeboxAlbumView from './JukeboxAlbumView';

vi.mock('../services/api', () => ({
  apiService: {
    getAlbum: vi.fn(),
    getImageUrl: vi.fn(() => '/img/sm/x.jpg'),
  },
}));

import { apiService } from '../services/api';

const album = { id: 7, title: 'Test Album' };

const renderView = (props = {}) =>
  render(
    <MemoryRouter>
      <JukeboxAlbumView album={album} onBack={vi.fn()} {...props} />
    </MemoryRouter>
  );

test('fetches and renders the album header and its tracks', async () => {
  apiService.getAlbum.mockResolvedValue({
    data: {
      artist: { id: 3, name: 'Test Artist' },
      album: { id: 7, title: 'Test Album', image_path: 'a.jpg' },
      tracks: [
        { id: 1, title: 'Track One', url: '/stream/1', artist: { id: 3, name: 'Test Artist' } },
        { id: 2, title: 'Track Two', url: '/stream/2', artist: { id: 3, name: 'Test Artist' } },
      ],
    },
  });
  renderView();

  await waitFor(() => {
    expect(apiService.getAlbum).toHaveBeenCalledWith(7);
    expect(screen.getAllByText('Test Album')[0]).toBeInTheDocument();
    expect(screen.getByText(/Track One/)).toBeInTheDocument();
    expect(screen.getByText(/Track Two/)).toBeInTheDocument();
  });
});

test('tapping Back calls onBack', () => {
  apiService.getAlbum.mockResolvedValue({ data: { artist: {}, album, tracks: [] } });
  const onBack = vi.fn();
  renderView({ onBack });

  fireEvent.click(screen.getByText('‹ Back'));

  expect(onBack).toHaveBeenCalled();
});

test('shows a retry option when fetching fails, and retry re-fetches', async () => {
  apiService.getAlbum.mockRejectedValueOnce(new Error('network error'));
  renderView();

  await waitFor(() => {
    expect(screen.getByText('Failed to load album.')).toBeInTheDocument();
  });

  apiService.getAlbum.mockResolvedValueOnce({
    data: { artist: { id: 3, name: 'Test Artist' }, album, tracks: [] },
  });
  fireEvent.click(screen.getByRole('button', { name: 'Retry' }));

  await waitFor(() => {
    expect(screen.getAllByText('Test Album')[0]).toBeInTheDocument();
  });
});

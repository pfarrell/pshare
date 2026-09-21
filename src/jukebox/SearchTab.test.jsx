import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { vi } from 'vitest';
import SearchTab from './SearchTab';

vi.mock('../services/api', () => ({
  apiService: {
    search: vi.fn(),
    getImageUrl: vi.fn(() => '/img/sm/x.jpg'),
  },
}));

import { apiService } from '../services/api';

const renderTab = (props = {}) =>
  render(<MemoryRouter><SearchTab onSelectArtist={vi.fn()} onSelectAlbum={vi.fn()} {...props} /></MemoryRouter>);

const searchResponse = {
  results: [
    { type: 'album', data: { id: 1, title: 'Found Album', image_path: 'a.jpg', artist: { id: 1, name: 'Found Artist' }, track_count: 5 } },
    { type: 'artist', data: { id: 2, name: 'Found Solo Artist', image_path: 'n.jpg' } },
  ],
  tracks: [
    { id: 10, title: 'Found Track', url: '/stream/10' },
  ],
};

test('searches on submit and renders artist, album, and track results', async () => {
  apiService.search.mockResolvedValue({ data: searchResponse });
  renderTab();

  fireEvent.change(screen.getByPlaceholderText('Search'), { target: { value: 'test query' } });
  fireEvent.submit(screen.getByRole('search'));

  await waitFor(() => {
    expect(apiService.search).toHaveBeenCalledWith('test query');
    expect(screen.getByText('Found Album')).toBeInTheDocument();
    expect(screen.getByText('Found Solo Artist')).toBeInTheDocument();
    // Track renders the title with a "01. " index prefix inline (see
    // Track.jsx), so it's never the sole text of any element — match the
    // same way Track.test.jsx does, via regex rather than exact string.
    expect(screen.getByText(/Found Track/)).toBeInTheDocument();
  });
});

test('tapping an artist result calls onSelectArtist with that artist', async () => {
  apiService.search.mockResolvedValue({ data: searchResponse });
  const onSelectArtist = vi.fn();
  renderTab({ onSelectArtist });
  fireEvent.change(screen.getByPlaceholderText('Search'), { target: { value: 'q' } });
  fireEvent.submit(screen.getByRole('search'));
  await waitFor(() => screen.getByText('Found Solo Artist'));

  fireEvent.click(screen.getByText('Found Solo Artist'));

  expect(onSelectArtist).toHaveBeenCalledWith(expect.objectContaining({ id: 2, name: 'Found Solo Artist' }));
});

test('tapping an album result calls onSelectAlbum with that album', async () => {
  apiService.search.mockResolvedValue({ data: searchResponse });
  const onSelectAlbum = vi.fn();
  renderTab({ onSelectAlbum });
  fireEvent.change(screen.getByPlaceholderText('Search'), { target: { value: 'q' } });
  fireEvent.submit(screen.getByRole('search'));
  await waitFor(() => screen.getByText('Found Album'));

  fireEvent.click(screen.getByText('Found Album'));

  expect(onSelectAlbum).toHaveBeenCalledWith(expect.objectContaining({ id: 1, title: 'Found Album' }));
});

test('shows a prompt before any search has been run', () => {
  renderTab();
  expect(screen.getByText('Search for something to play')).toBeInTheDocument();
});

test('shows a retry option when search fails, and retry re-runs the same query', async () => {
  apiService.search.mockRejectedValueOnce(new Error('network error'));
  renderTab();

  fireEvent.change(screen.getByPlaceholderText('Search'), { target: { value: 'test query' } });
  fireEvent.submit(screen.getByRole('search'));

  await waitFor(() => {
    expect(screen.getByText('Search failed.')).toBeInTheDocument();
  });

  apiService.search.mockResolvedValueOnce({ data: { results: [], tracks: [] } });
  fireEvent.click(screen.getByRole('button', { name: 'Retry' }));

  await waitFor(() => {
    expect(apiService.search).toHaveBeenCalledWith('test query');
    expect(screen.getByText('No results')).toBeInTheDocument();
  });
});

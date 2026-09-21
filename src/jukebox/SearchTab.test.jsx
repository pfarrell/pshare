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
vi.mock('./JukeboxArtistView', () => ({
  default: ({ artist, onBack }) => (
    <div data-testid="jukebox-artist-view">
      <span>artist-view: {artist.name}</span>
      <button onClick={onBack}>back-from-artist</button>
    </div>
  ),
}));
vi.mock('./JukeboxAlbumView', () => ({
  default: ({ album, onBack }) => (
    <div data-testid="jukebox-album-view">
      <span>album-view: {album.title}</span>
      <button onClick={onBack}>back-from-album</button>
    </div>
  ),
}));

import { apiService } from '../services/api';

const renderTab = () => render(<MemoryRouter><SearchTab /></MemoryRouter>);

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

test('tapping an artist result drills into JukeboxArtistView', async () => {
  apiService.search.mockResolvedValue({ data: searchResponse });
  renderTab();
  fireEvent.change(screen.getByPlaceholderText('Search'), { target: { value: 'q' } });
  fireEvent.submit(screen.getByRole('search'));
  await waitFor(() => screen.getByText('Found Solo Artist'));

  fireEvent.click(screen.getByText('Found Solo Artist'));

  expect(screen.getByTestId('jukebox-artist-view')).toBeInTheDocument();
  expect(screen.getByText('artist-view: Found Solo Artist')).toBeInTheDocument();
});

test('tapping an album result drills into JukeboxAlbumView', async () => {
  apiService.search.mockResolvedValue({ data: searchResponse });
  renderTab();
  fireEvent.change(screen.getByPlaceholderText('Search'), { target: { value: 'q' } });
  fireEvent.submit(screen.getByRole('search'));
  await waitFor(() => screen.getByText('Found Album'));

  fireEvent.click(screen.getByText('Found Album'));

  expect(screen.getByTestId('jukebox-album-view')).toBeInTheDocument();
  expect(screen.getByText('album-view: Found Album')).toBeInTheDocument();
});

test('back from a drill-down view returns to search results', async () => {
  apiService.search.mockResolvedValue({ data: searchResponse });
  renderTab();
  fireEvent.change(screen.getByPlaceholderText('Search'), { target: { value: 'q' } });
  fireEvent.submit(screen.getByRole('search'));
  await waitFor(() => screen.getByText('Found Album'));

  fireEvent.click(screen.getByText('Found Album'));
  expect(screen.getByTestId('jukebox-album-view')).toBeInTheDocument();

  fireEvent.click(screen.getByText('back-from-album'));

  expect(screen.queryByTestId('jukebox-album-view')).not.toBeInTheDocument();
  expect(screen.getByText('Found Album')).toBeInTheDocument();
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

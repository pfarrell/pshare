import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { vi } from 'vitest';
import JukeboxArtistView from './JukeboxArtistView';

vi.mock('../services/api', () => ({
  apiService: {
    getArtist: vi.fn(),
    getRandomScopeTracks: vi.fn(),
    getImageUrl: vi.fn(() => '/img/sm/x.jpg'),
  },
}));

const queue = { loading: false, play: vi.fn(), playNext: vi.fn(), addToQueue: vi.fn() };
vi.mock('../hooks/useQueueActions', () => ({ useQueueActions: vi.fn(() => queue) }));

import { apiService } from '../services/api';
import { useQueueActions } from '../hooks/useQueueActions';

const artist = { id: 5, name: 'Test Artist' };

beforeEach(() => {
  vi.clearAllMocks();
  queue.loading = false;
});

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

test('Shuffle artist plays a random selection of the artist\'s tracks through the shared queue hook', async () => {
  apiService.getArtist.mockResolvedValue({ data: { artist, albums: [] } });
  apiService.getRandomScopeTracks.mockResolvedValue({ data: { tracks: [{ id: 1 }, { id: 2 }] } });
  renderView();

  // The hook is handed a fetching function plus the artist as queue source.
  const [source, options] = useQueueActions.mock.calls.at(-1);
  expect(options.queueSource).toEqual({ type: 'artist', id: 5 });
  await expect(source()).resolves.toEqual([{ id: 1 }, { id: 2 }]);
  expect(apiService.getRandomScopeTracks).toHaveBeenCalledWith('artist', 5);

  fireEvent.click(screen.getByRole('button', { name: 'Shuffle artist' }));
  expect(queue.play).toHaveBeenCalledTimes(1);
});

test('Shuffle artist is available even before the albums have loaded', () => {
  apiService.getArtist.mockReturnValue(new Promise(() => {}));
  renderView();
  expect(screen.getByRole('button', { name: 'Shuffle artist' })).toBeEnabled();
});

test('Shuffle artist is disabled while its tracks are loading', () => {
  queue.loading = true;
  apiService.getArtist.mockReturnValue(new Promise(() => {}));
  renderView();
  expect(screen.getByRole('button', { name: /Shuffl/ })).toBeDisabled();
});

test('Shuffle artist also calls onEnqueue', async () => {
  apiService.getArtist.mockResolvedValue({ data: { artist, albums: [] } });
  const onEnqueue = vi.fn();
  renderView({ onEnqueue });

  fireEvent.click(screen.getByRole('button', { name: 'Shuffle artist' }));

  expect(onEnqueue).toHaveBeenCalledTimes(1);
});

test('album tiles are plain buttons — no play buttons or menus', async () => {
  apiService.getArtist.mockResolvedValue({
    data: { artist, albums: [{ id: 1, title: 'Album One', image_path: 'a.jpg', track_count: 8 }] },
  });
  const { container } = renderView();
  await waitFor(() => screen.getByText('Album One'));

  expect(container.querySelector('.jukebox-album-grid')).not.toBeNull();
  expect(screen.queryByRole('button', { name: /^Play / })).toBeNull();
});

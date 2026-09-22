import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { vi } from 'vitest';
import JukeboxTracksPanel from './JukeboxTracksPanel';

vi.mock('../services/api', () => ({
  apiService: {
    getAlbum: vi.fn(),
    getImageUrl: vi.fn(() => '/img/sm/x.jpg'),
  },
}));

const queue = { loading: false, play: vi.fn(), playNext: vi.fn(), addToQueue: vi.fn() };
vi.mock('../hooks/useQueueActions', () => ({ useQueueActions: vi.fn(() => queue) }));

import { apiService } from '../services/api';
import { useQueueActions } from '../hooks/useQueueActions';

const album = { id: 7, title: 'Test Album' };
const albumResponse = {
  data: {
    artist: { id: 3, name: 'Test Artist' },
    album: { id: 7, title: 'Test Album', image_path: 'a.jpg' },
    tracks: [
      { id: 1, title: 'Track One', url: '/stream/1', artist: { id: 3, name: 'Test Artist' } },
      { id: 2, title: 'Track Two', url: '/stream/2', artist: { id: 3, name: 'Test Artist' } },
    ],
  },
};

const renderPanel = (props = {}) =>
  render(
    <MemoryRouter>
      <JukeboxTracksPanel album={album} onClose={vi.fn()} {...props} />
    </MemoryRouter>
  );

beforeEach(() => {
  vi.clearAllMocks();
  apiService.getAlbum.mockResolvedValue(albumResponse);
});

test('fetches the album and renders its title, artist and tracks', async () => {
  renderPanel();

  await waitFor(() => {
    expect(apiService.getAlbum).toHaveBeenCalledWith(7);
    expect(screen.getByRole('heading', { name: 'Test Album' })).toBeInTheDocument();
    expect(screen.getByText('Test Artist', { selector: '.jukebox-tracks-panel-artist' })).toBeInTheDocument();
    expect(screen.getByText(/Track One/)).toBeInTheDocument();
    expect(screen.getByText(/Track Two/)).toBeInTheDocument();
  });
});

test('shows the header title right away, before the album finishes loading', () => {
  apiService.getAlbum.mockReturnValue(new Promise(() => {}));
  renderPanel();

  expect(screen.getByRole('heading', { name: 'Test Album' })).toBeInTheDocument();
  expect(screen.getByText('Loading…')).toBeInTheDocument();
});

test('tapping the close button calls onClose', () => {
  const onClose = vi.fn();
  renderPanel({ onClose });

  fireEvent.click(screen.getByRole('button', { name: 'Close' }));

  expect(onClose).toHaveBeenCalled();
});

test('Play album and Add to queue drive the whole loaded album through the shared queue hook', async () => {
  renderPanel();
  await waitFor(() => screen.getByText(/Track One/));

  // The hook is handed the already-loaded tracks (not a refetch) plus the album as queue source.
  const [source, options] = useQueueActions.mock.calls.at(-1);
  expect(source.map((t) => t.id)).toEqual([1, 2]);
  expect(options.queueSource).toEqual({ type: 'album', id: 7 });

  fireEvent.click(screen.getByRole('button', { name: 'Play album' }));
  expect(queue.play).toHaveBeenCalledTimes(1);

  fireEvent.click(screen.getByRole('button', { name: 'Add to queue' }));
  expect(queue.addToQueue).toHaveBeenCalledTimes(1);
});

test('the album buttons are disabled until the tracks have loaded', async () => {
  let resolve;
  apiService.getAlbum.mockReturnValue(new Promise((r) => { resolve = r; }));
  renderPanel();

  expect(screen.getByRole('button', { name: 'Play album' })).toBeDisabled();
  expect(screen.getByRole('button', { name: 'Add to queue' })).toBeDisabled();

  resolve(albumResponse);
  await waitFor(() => expect(screen.getByRole('button', { name: 'Play album' })).toBeEnabled());
});

test('refetches and swaps content when a different album is selected', async () => {
  const { rerender } = renderPanel();
  await waitFor(() => screen.getByText(/Track One/));

  apiService.getAlbum.mockResolvedValue({
    data: {
      artist: { id: 4, name: 'Other Artist' },
      album: { id: 8, title: 'Other Album', image_path: 'b.jpg' },
      tracks: [{ id: 9, title: 'Other Track', url: '/stream/9', artist: { id: 4, name: 'Other Artist' } }],
    },
  });
  rerender(
    <MemoryRouter>
      <JukeboxTracksPanel album={{ id: 8, title: 'Other Album' }} onClose={vi.fn()} />
    </MemoryRouter>
  );

  await waitFor(() => {
    expect(apiService.getAlbum).toHaveBeenLastCalledWith(8);
    expect(screen.getByText(/Other Track/)).toBeInTheDocument();
    expect(screen.queryByText(/Track One/)).not.toBeInTheDocument();
  });
});

test('shows an error with a working retry when the album fails to load', async () => {
  apiService.getAlbum.mockRejectedValueOnce(new Error('network'));
  renderPanel();
  await waitFor(() => screen.getByText('Failed to load album.'));

  fireEvent.click(screen.getByRole('button', { name: 'Retry' }));

  await waitFor(() => expect(screen.getByText(/Track One/)).toBeInTheDocument());
});

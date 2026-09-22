import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { vi } from 'vitest';
import JukeboxPlaylistPanel from './JukeboxPlaylistPanel';

vi.mock('../services/api', () => ({
  apiService: {
    getPlaylist: vi.fn(),
    getImageUrl: vi.fn(() => '/img/sm/x.jpg'),
  },
}));

const queue = { loading: false, play: vi.fn(), playNext: vi.fn(), addToQueue: vi.fn() };
vi.mock('../hooks/useQueueActions', () => ({ useQueueActions: vi.fn(() => queue) }));

import { apiService } from '../services/api';
import { useQueueActions } from '../hooks/useQueueActions';

const playlist = { id: 9, name: 'Road Trip' };
const playlistResponse = {
  data: {
    playlist: { id: 9, name: 'Road Trip', image_path: 'p.jpg' },
    tracks: [
      { id: 1, title: 'Track One', url: '/stream/1', artist: { id: 3, name: 'Some Artist' } },
      { id: 2, title: 'Track Two', url: '/stream/2', artist: { id: 3, name: 'Some Artist' } },
    ],
  },
};

const renderPanel = (props = {}) =>
  render(
    <MemoryRouter>
      <JukeboxPlaylistPanel playlist={playlist} onClose={vi.fn()} {...props} />
    </MemoryRouter>
  );

beforeEach(() => {
  vi.clearAllMocks();
  apiService.getPlaylist.mockResolvedValue(playlistResponse);
});

test('fetches the playlist and renders its title and tracks', async () => {
  renderPanel();

  await waitFor(() => {
    expect(apiService.getPlaylist).toHaveBeenCalledWith(9);
    expect(screen.getByRole('heading', { name: 'Road Trip' })).toBeInTheDocument();
    expect(screen.getByText(/Track One/)).toBeInTheDocument();
    expect(screen.getByText(/Track Two/)).toBeInTheDocument();
  });
});

test('shows the header title right away, before the playlist finishes loading', () => {
  apiService.getPlaylist.mockReturnValue(new Promise(() => {}));
  renderPanel();

  expect(screen.getByRole('heading', { name: 'Road Trip' })).toBeInTheDocument();
  expect(screen.getByText('Loading…')).toBeInTheDocument();
});

test('tapping the close button calls onClose', () => {
  const onClose = vi.fn();
  renderPanel({ onClose });

  fireEvent.click(screen.getByRole('button', { name: 'Close' }));

  expect(onClose).toHaveBeenCalled();
});

test('Play playlist and Add to queue drive the whole loaded playlist through the shared queue hook', async () => {
  renderPanel();
  await waitFor(() => screen.getByText(/Track One/));

  const [source, options] = useQueueActions.mock.calls.at(-1);
  expect(source.map((t) => t.id)).toEqual([1, 2]);
  expect(options.queueSource).toEqual({ type: 'playlist', id: 9 });

  fireEvent.click(screen.getByRole('button', { name: 'Play playlist' }));
  expect(queue.play).toHaveBeenCalledTimes(1);

  fireEvent.click(screen.getByRole('button', { name: 'Add to queue' }));
  expect(queue.addToQueue).toHaveBeenCalledTimes(1);
});

test('Play playlist, Add to queue, and a track tap all also call onEnqueue', async () => {
  const onEnqueue = vi.fn();
  renderPanel({ onEnqueue });
  await waitFor(() => screen.getByText(/Track One/));

  fireEvent.click(screen.getByRole('button', { name: 'Play playlist' }));
  expect(onEnqueue).toHaveBeenCalledTimes(1);

  fireEvent.click(screen.getByRole('button', { name: 'Add to queue' }));
  expect(onEnqueue).toHaveBeenCalledTimes(2);

  fireEvent.click(screen.getByText(/Track One/));
  expect(onEnqueue).toHaveBeenCalledTimes(3);
});

test('the buttons are disabled until the tracks have loaded', async () => {
  let resolve;
  apiService.getPlaylist.mockReturnValue(new Promise((r) => { resolve = r; }));
  renderPanel();

  expect(screen.getByRole('button', { name: 'Play playlist' })).toBeDisabled();
  expect(screen.getByRole('button', { name: 'Add to queue' })).toBeDisabled();

  resolve(playlistResponse);
  await waitFor(() => expect(screen.getByRole('button', { name: 'Play playlist' })).toBeEnabled());
});

test('refetches and swaps content when a different playlist is selected', async () => {
  const { rerender } = renderPanel();
  await waitFor(() => screen.getByText(/Track One/));

  apiService.getPlaylist.mockResolvedValue({
    data: {
      playlist: { id: 10, name: 'Other Playlist', image_path: 'q.jpg' },
      tracks: [{ id: 9, title: 'Other Track', url: '/stream/9', artist: { id: 4, name: 'Other Artist' } }],
    },
  });
  rerender(
    <MemoryRouter>
      <JukeboxPlaylistPanel playlist={{ id: 10, name: 'Other Playlist' }} onClose={vi.fn()} />
    </MemoryRouter>
  );

  await waitFor(() => {
    expect(apiService.getPlaylist).toHaveBeenLastCalledWith(10);
    expect(screen.getByText(/Other Track/)).toBeInTheDocument();
    expect(screen.queryByText(/Track One/)).not.toBeInTheDocument();
  });
});

test('shows an error with a working retry when the playlist fails to load', async () => {
  apiService.getPlaylist.mockRejectedValueOnce(new Error('network'));
  renderPanel();
  await waitFor(() => screen.getByText('Failed to load playlist.'));

  fireEvent.click(screen.getByRole('button', { name: 'Retry' }));

  await waitFor(() => expect(screen.getByText(/Track One/)).toBeInTheDocument());
});

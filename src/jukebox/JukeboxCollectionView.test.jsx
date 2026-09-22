import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { vi } from 'vitest';
import JukeboxCollectionView from './JukeboxCollectionView';

vi.mock('../services/api', () => ({
  apiService: {
    getCollection: vi.fn(),
    getRandomScopeTracks: vi.fn(),
    getImageUrl: vi.fn(() => '/img/sm/x.jpg'),
  },
}));

const queue = { loading: false, play: vi.fn(), playNext: vi.fn(), addToQueue: vi.fn() };
vi.mock('../hooks/useQueueActions', () => ({ useQueueActions: vi.fn(() => queue) }));

import { apiService } from '../services/api';
import { useQueueActions } from '../hooks/useQueueActions';

const collection = { id: 6, name: 'Sunday Morning' };

beforeEach(() => {
  vi.clearAllMocks();
  queue.loading = false;
});

const renderView = (props = {}) =>
  render(
    <MemoryRouter>
      <JukeboxCollectionView collection={collection} onSelectAlbum={vi.fn()} onBack={vi.fn()} {...props} />
    </MemoryRouter>
  );

test('fetches and renders the collection\'s albums', async () => {
  apiService.getCollection.mockResolvedValue({
    data: {
      collection,
      albums: [
        { id: 1, title: 'Album One', image_path: 'a.jpg', artist: { id: 3, name: 'Artist A' } },
        { id: 2, title: 'Album Two', image_path: 'b.jpg', artist: { id: 4, name: 'Artist B' } },
      ],
    },
  });
  renderView();

  await waitFor(() => {
    expect(apiService.getCollection).toHaveBeenCalledWith(6);
    expect(screen.getByText('Album One')).toBeInTheDocument();
    expect(screen.getByText('Album Two')).toBeInTheDocument();
  });
  expect(screen.getByRole('heading', { name: 'Sunday Morning' })).toBeInTheDocument();
});

test('skips unresolved stubs — only real albums are shown', async () => {
  apiService.getCollection.mockResolvedValue({
    data: {
      collection,
      albums: [{ id: 1, title: 'Album One', image_path: 'a.jpg', artist: { id: 3, name: 'Artist A' } }],
      stubs: [{ id: 99, title: 'Unresolved Stub' }],
    },
  });
  renderView();

  await waitFor(() => screen.getByText('Album One'));
  expect(screen.queryByText('Unresolved Stub')).not.toBeInTheDocument();
});

test('tapping an album calls onSelectAlbum with that album', async () => {
  apiService.getCollection.mockResolvedValue({
    data: { collection, albums: [{ id: 1, title: 'Album One', image_path: 'a.jpg', artist: { id: 3, name: 'Artist A' } }] },
  });
  const onSelectAlbum = vi.fn();
  renderView({ onSelectAlbum });
  await waitFor(() => screen.getByText('Album One'));

  fireEvent.click(screen.getByText('Album One'));

  expect(onSelectAlbum).toHaveBeenCalledWith(expect.objectContaining({ id: 1, title: 'Album One' }));
});

test('tapping Back calls onBack', () => {
  apiService.getCollection.mockResolvedValue({ data: { collection, albums: [] } });
  const onBack = vi.fn();
  renderView({ onBack });

  fireEvent.click(screen.getByText('‹ Back'));

  expect(onBack).toHaveBeenCalled();
});

test('shows an empty state when the collection has no albums', async () => {
  apiService.getCollection.mockResolvedValue({ data: { collection, albums: [] } });
  renderView();
  await waitFor(() => {
    expect(screen.getByText('No albums found')).toBeInTheDocument();
  });
});

test('shows a retry option when fetching fails, and retry re-fetches', async () => {
  apiService.getCollection.mockRejectedValueOnce(new Error('network error'));
  renderView();

  await waitFor(() => {
    expect(screen.getByText('Failed to load albums.')).toBeInTheDocument();
  });

  apiService.getCollection.mockResolvedValueOnce({
    data: { collection, albums: [{ id: 1, title: 'Album One', image_path: 'a.jpg', artist: { id: 3, name: 'Artist A' } }] },
  });
  fireEvent.click(screen.getByRole('button', { name: 'Retry' }));

  await waitFor(() => {
    expect(screen.getByText('Album One')).toBeInTheDocument();
  });
});

test('Shuffle All plays a random selection of the collection\'s tracks through the shared queue hook', async () => {
  apiService.getCollection.mockResolvedValue({ data: { collection, albums: [] } });
  apiService.getRandomScopeTracks.mockResolvedValue({ data: { tracks: [{ id: 1 }, { id: 2 }] } });
  renderView();

  const [source, options] = useQueueActions.mock.calls.at(-1);
  expect(options.queueSource).toEqual({ type: 'collection', id: 6 });
  await expect(source()).resolves.toEqual([{ id: 1 }, { id: 2 }]);
  expect(apiService.getRandomScopeTracks).toHaveBeenCalledWith('collection', 6);

  fireEvent.click(screen.getByRole('button', { name: 'Shuffle All' }));
  expect(queue.play).toHaveBeenCalledTimes(1);
});

test('Shuffle All also calls onEnqueue', async () => {
  apiService.getCollection.mockResolvedValue({ data: { collection, albums: [] } });
  const onEnqueue = vi.fn();
  renderView({ onEnqueue });

  fireEvent.click(screen.getByRole('button', { name: 'Shuffle All' }));

  expect(onEnqueue).toHaveBeenCalledTimes(1);
});

test('Shuffle All is available even before the albums have loaded, and disabled while its tracks are loading', () => {
  apiService.getCollection.mockReturnValue(new Promise(() => {}));
  renderView();
  expect(screen.getByRole('button', { name: 'Shuffle All' })).toBeEnabled();
});

test('Shuffle All is disabled while its tracks are loading', () => {
  queue.loading = true;
  apiService.getCollection.mockReturnValue(new Promise(() => {}));
  renderView();
  expect(screen.getByRole('button', { name: 'Shuffle All' })).toBeDisabled();
});

test('album tiles are plain buttons — no play buttons or menus', async () => {
  apiService.getCollection.mockResolvedValue({
    data: { collection, albums: [{ id: 1, title: 'Album One', image_path: 'a.jpg', artist: { id: 3, name: 'Artist A' } }] },
  });
  const { container } = renderView();
  await waitFor(() => screen.getByText('Album One'));

  expect(container.querySelector('.jukebox-album-grid')).not.toBeNull();
  expect(screen.queryByRole('button', { name: /^Play / })).toBeNull();
});

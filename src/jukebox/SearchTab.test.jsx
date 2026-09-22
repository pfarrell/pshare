import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
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
  render(<MemoryRouter><SearchTab onSelectArtist={vi.fn()} onSelectAlbum={vi.fn()} onSelectPlaylist={vi.fn()} onSelectCollection={vi.fn()} {...props} /></MemoryRouter>);

const runSearch = async (query = 'q') => {
  fireEvent.change(screen.getByPlaceholderText('Search'), { target: { value: query } });
  fireEvent.submit(screen.getByRole('search'));
  await waitFor(() => expect(apiService.search).toHaveBeenCalledWith(query));
};

// Small result set: one of each.
const smallResponse = {
  results: [
    { type: 'album', data: { id: 1, title: 'Found Album', image_path: 'a.jpg', artist: { id: 1, name: 'Found Artist' }, track_count: 5 } },
    { type: 'artist', data: { id: 2, name: 'Found Solo Artist', image_path: 'n.jpg', album_count: 3 } },
    { type: 'playlist', data: { id: 20, name: 'Found Playlist', image_path: 'p.jpg', track_count: 12 } },
    { type: 'collection', data: { id: 21, name: 'Found Collection', image_path: 'c.jpg', album_count: 4 } },
  ],
  tracks: [{ id: 10, title: 'Found Track', url: '/stream/10' }],
};

// Large result set: more of each than the All view previews (6 / 4 / 4 / 4 / 5).
const bigResponse = {
  results: [
    ...Array.from({ length: 8 }, (_, i) => ({ type: 'artist', data: { id: 100 + i, name: `Artist ${i + 1}`, image_path: 'n.jpg', album_count: 2 } })),
    ...Array.from({ length: 6 }, (_, i) => ({ type: 'album', data: { id: 200 + i, title: `Album ${i + 1}`, image_path: 'a.jpg', artist: { id: 1, name: 'Some Artist' } } })),
    ...Array.from({ length: 5 }, (_, i) => ({ type: 'playlist', data: { id: 400 + i, name: `Playlist ${i + 1}`, image_path: 'p.jpg', track_count: 3 } })),
    ...Array.from({ length: 5 }, (_, i) => ({ type: 'collection', data: { id: 500 + i, name: `Collection ${i + 1}`, image_path: 'c.jpg', album_count: 2 } })),
  ],
  tracks: Array.from({ length: 7 }, (_, i) => ({ id: 300 + i, title: `Song ${i + 1}`, url: `/stream/${300 + i}` })),
};

const section = (name) => screen.getByRole('heading', { name }).closest('section');

beforeEach(() => {
  vi.clearAllMocks();
});

test('shows a prompt before any search has been run, and no filter chips yet', () => {
  renderTab();
  expect(screen.getByText('Search for something to play')).toBeInTheDocument();
  expect(screen.queryByRole('button', { name: /^Albums/ })).not.toBeInTheDocument();
});

test('searches on submit and renders artist, album, and track results', async () => {
  apiService.search.mockResolvedValue({ data: smallResponse });
  renderTab();
  await runSearch('test query');

  await waitFor(() => {
    expect(screen.getByText('Found Album')).toBeInTheDocument();
    expect(screen.getByText('Found Solo Artist')).toBeInTheDocument();
    // Track renders the title with a "01. " index prefix inline (see
    // Track.jsx), so it's never the sole text of any element — match the
    // same way Track.test.jsx does, via regex rather than exact string.
    expect(screen.getByText(/Found Track/)).toBeInTheDocument();
  });
});

test('shows filter chips with per-type counts, All selected by default', async () => {
  apiService.search.mockResolvedValue({ data: bigResponse });
  renderTab();
  await runSearch();

  await waitFor(() => screen.getByRole('button', { name: 'Albums (6)' }));
  expect(screen.getByRole('button', { name: 'All' })).toHaveAttribute('aria-pressed', 'true');
  expect(screen.getByRole('button', { name: 'Artists (8)' })).toHaveAttribute('aria-pressed', 'false');
  expect(screen.getByRole('button', { name: 'Tracks (7)' })).toBeInTheDocument();
});

test('the All view previews a few of each type under headings, with See all for the overflow', async () => {
  apiService.search.mockResolvedValue({ data: bigResponse });
  renderTab();
  await runSearch();
  await waitFor(() => screen.getByRole('heading', { name: 'Artists' }));

  expect(within(section('Artists')).getAllByRole('button', { name: /Artist \d/ })).toHaveLength(6);
  expect(within(section('Albums')).getAllByRole('button', { name: /Album \d/ })).toHaveLength(4);
  expect(within(section('Tracks')).getAllByText(/Song \d/)).toHaveLength(5);

  expect(within(section('Artists')).getByRole('button', { name: 'See all (8)' })).toBeInTheDocument();
  expect(within(section('Albums')).getByRole('button', { name: 'See all (6)' })).toBeInTheDocument();
  expect(within(section('Tracks')).getByRole('button', { name: 'See all (7)' })).toBeInTheDocument();
});

test('sections with no results are omitted, and See all is hidden when nothing overflows', async () => {
  apiService.search.mockResolvedValue({ data: { results: [smallResponse.results[0]], tracks: [] } });
  renderTab();
  await runSearch();
  await waitFor(() => screen.getByRole('heading', { name: 'Albums' }));

  expect(screen.queryByRole('heading', { name: 'Artists' })).not.toBeInTheDocument();
  expect(screen.queryByRole('heading', { name: 'Tracks' })).not.toBeInTheDocument();
  expect(screen.queryByRole('button', { name: /See all/ })).not.toBeInTheDocument();
});

test('See all switches to that type, showing every result and only that type', async () => {
  apiService.search.mockResolvedValue({ data: bigResponse });
  renderTab();
  await runSearch();
  await waitFor(() => screen.getByRole('heading', { name: 'Albums' }));

  fireEvent.click(within(section('Albums')).getByRole('button', { name: 'See all (6)' }));

  expect(screen.getAllByRole('button', { name: /Album \d/ })).toHaveLength(6);
  expect(screen.queryByRole('button', { name: /Artist \d/ })).not.toBeInTheDocument();
  expect(screen.queryByText(/Song \d/)).not.toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Albums (6)' })).toHaveAttribute('aria-pressed', 'true');
});

test('the type chips filter the results and All returns to the overview', async () => {
  apiService.search.mockResolvedValue({ data: bigResponse });
  renderTab();
  await runSearch();
  await waitFor(() => screen.getByRole('button', { name: 'Tracks (7)' }));

  fireEvent.click(screen.getByRole('button', { name: 'Tracks (7)' }));
  expect(screen.getAllByText(/Song \d/)).toHaveLength(7);
  expect(screen.queryByRole('button', { name: /Album \d/ })).not.toBeInTheDocument();

  fireEvent.click(screen.getByRole('button', { name: 'Artists (8)' }));
  expect(screen.getAllByRole('button', { name: /Artist \d/ })).toHaveLength(8);

  fireEvent.click(screen.getByRole('button', { name: 'All' }));
  expect(screen.getByRole('heading', { name: 'Albums' })).toBeInTheDocument();
});

test('a chip for a type with no results is disabled', async () => {
  apiService.search.mockResolvedValue({ data: { results: [smallResponse.results[0]], tracks: [] } });
  renderTab();
  await runSearch();

  await waitFor(() => screen.getByRole('button', { name: 'Albums (1)' }));
  expect(screen.getByRole('button', { name: 'Artists (0)' })).toBeDisabled();
  expect(screen.getByRole('button', { name: 'Tracks (0)' })).toBeDisabled();
});

test('a new search resets the filter back to All', async () => {
  apiService.search.mockResolvedValue({ data: bigResponse });
  renderTab();
  await runSearch('first');
  await waitFor(() => screen.getByRole('button', { name: 'Tracks (7)' }));
  fireEvent.click(screen.getByRole('button', { name: 'Tracks (7)' }));

  await runSearch('second');

  await waitFor(() => expect(screen.getByRole('button', { name: 'All' })).toHaveAttribute('aria-pressed', 'true'));
  expect(screen.getByRole('heading', { name: 'Artists' })).toBeInTheDocument();
});

test('tapping an artist result calls onSelectArtist with that artist', async () => {
  apiService.search.mockResolvedValue({ data: smallResponse });
  const onSelectArtist = vi.fn();
  renderTab({ onSelectArtist });
  await runSearch();
  await waitFor(() => screen.getByText('Found Solo Artist'));

  fireEvent.click(screen.getByText('Found Solo Artist'));

  expect(onSelectArtist).toHaveBeenCalledWith(expect.objectContaining({ id: 2, name: 'Found Solo Artist' }));
});

test('tapping an album result calls onSelectAlbum with that album', async () => {
  apiService.search.mockResolvedValue({ data: smallResponse });
  const onSelectAlbum = vi.fn();
  renderTab({ onSelectAlbum });
  await runSearch();
  await waitFor(() => screen.getByText('Found Album'));

  fireEvent.click(screen.getByText('Found Album'));

  expect(onSelectAlbum).toHaveBeenCalledWith(expect.objectContaining({ id: 1, title: 'Found Album' }));
});

test('artist and album results are plain tiles — each section holds only its tiles, no play buttons or menus', async () => {
  apiService.search.mockResolvedValue({ data: smallResponse });
  renderTab();
  await runSearch();
  await waitFor(() => screen.getByText('Found Album'));

  // (Track rows below keep their own per-track play buttons; that's intended.)
  expect(within(section('Artists')).getAllByRole('button')).toHaveLength(1);
  expect(within(section('Albums')).getAllByRole('button')).toHaveLength(1);
});

test('tapping a track in the All view calls onEnqueue', async () => {
  apiService.search.mockResolvedValue({ data: smallResponse });
  const onEnqueue = vi.fn();
  renderTab({ onEnqueue });
  await runSearch();
  await waitFor(() => screen.getByText(/Found Track/));

  fireEvent.click(screen.getByText(/Found Track/));

  expect(onEnqueue).toHaveBeenCalledTimes(1);
});

test('tapping a track in the Tracks-filtered view calls onEnqueue', async () => {
  apiService.search.mockResolvedValue({ data: bigResponse });
  const onEnqueue = vi.fn();
  renderTab({ onEnqueue });
  await runSearch();
  await waitFor(() => screen.getByRole('button', { name: 'Tracks (7)' }));
  fireEvent.click(screen.getByRole('button', { name: 'Tracks (7)' }));

  fireEvent.click(screen.getAllByText(/Song \d/)[0]);

  expect(onEnqueue).toHaveBeenCalledTimes(1);
});

test('shows filter chips for playlists and collections too, with counts', async () => {
  apiService.search.mockResolvedValue({ data: bigResponse });
  renderTab();
  await runSearch();

  await waitFor(() => screen.getByRole('button', { name: 'Playlists (5)' }));
  expect(screen.getByRole('button', { name: 'Collections (5)' })).toBeInTheDocument();
});

test('the All view previews playlists and collections too, with See all for the overflow', async () => {
  apiService.search.mockResolvedValue({ data: bigResponse });
  renderTab();
  await runSearch();
  await waitFor(() => screen.getByRole('heading', { name: 'Playlists' }));

  expect(within(section('Playlists')).getAllByRole('button', { name: /Playlist \d/ })).toHaveLength(4);
  expect(within(section('Collections')).getAllByRole('button', { name: /Collection \d/ })).toHaveLength(4);
  expect(within(section('Playlists')).getByRole('button', { name: 'See all (5)' })).toBeInTheDocument();
  expect(within(section('Collections')).getByRole('button', { name: 'See all (5)' })).toBeInTheDocument();
});

test('Playlists and Collections chips filter to just that type', async () => {
  apiService.search.mockResolvedValue({ data: bigResponse });
  renderTab();
  await runSearch();
  await waitFor(() => screen.getByRole('button', { name: 'Playlists (5)' }));

  fireEvent.click(screen.getByRole('button', { name: 'Playlists (5)' }));
  expect(screen.getAllByRole('button', { name: /Playlist \d/ })).toHaveLength(5);
  expect(screen.queryByRole('button', { name: /Collection \d/ })).not.toBeInTheDocument();

  fireEvent.click(screen.getByRole('button', { name: 'Collections (5)' }));
  expect(screen.getAllByRole('button', { name: /Collection \d/ })).toHaveLength(5);
});

test('tapping a playlist result calls onSelectPlaylist with that playlist', async () => {
  apiService.search.mockResolvedValue({ data: smallResponse });
  const onSelectPlaylist = vi.fn();
  renderTab({ onSelectPlaylist });
  await runSearch();
  await waitFor(() => screen.getByText('Found Playlist'));

  fireEvent.click(screen.getByText('Found Playlist'));

  expect(onSelectPlaylist).toHaveBeenCalledWith(expect.objectContaining({ id: 20, name: 'Found Playlist' }));
});

test('tapping a collection result calls onSelectCollection with that collection', async () => {
  apiService.search.mockResolvedValue({ data: smallResponse });
  const onSelectCollection = vi.fn();
  renderTab({ onSelectCollection });
  await runSearch();
  await waitFor(() => screen.getByText('Found Collection'));

  fireEvent.click(screen.getByText('Found Collection'));

  expect(onSelectCollection).toHaveBeenCalledWith(expect.objectContaining({ id: 21, name: 'Found Collection' }));
});

test('playlist and collection chips are disabled when there are none', async () => {
  apiService.search.mockResolvedValue({ data: { results: [smallResponse.results[0]], tracks: [] } });
  renderTab();
  await runSearch();

  await waitFor(() => screen.getByRole('button', { name: 'Albums (1)' }));
  expect(screen.getByRole('button', { name: 'Playlists (0)' })).toBeDisabled();
  expect(screen.getByRole('button', { name: 'Collections (0)' })).toBeDisabled();
});

test('playlist and collection tiles are plain buttons — no play buttons or menus', async () => {
  apiService.search.mockResolvedValue({ data: smallResponse });
  renderTab();
  await runSearch();
  await waitFor(() => screen.getByText('Found Playlist'));

  expect(within(section('Playlists')).getAllByRole('button')).toHaveLength(1);
  expect(within(section('Collections')).getAllByRole('button')).toHaveLength(1);
});

test('tapping an artist or album tile does NOT call onEnqueue — that is navigation, not enqueueing', async () => {
  apiService.search.mockResolvedValue({ data: smallResponse });
  const onEnqueue = vi.fn();
  renderTab({ onEnqueue });
  await runSearch();
  await waitFor(() => screen.getByText('Found Album'));

  fireEvent.click(screen.getByText('Found Solo Artist'));
  fireEvent.click(screen.getByText('Found Album'));

  expect(onEnqueue).not.toHaveBeenCalled();
});

test('shows "No results" and no chips when nothing matches', async () => {
  apiService.search.mockResolvedValue({ data: { results: [], tracks: [] } });
  renderTab();
  await runSearch();

  await waitFor(() => expect(screen.getByText('No results')).toBeInTheDocument());
  expect(screen.queryByRole('button', { name: 'All' })).not.toBeInTheDocument();
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

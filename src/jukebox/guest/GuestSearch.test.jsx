import { screen, fireEvent, waitFor } from '@testing-library/react';
import GuestSearch from './GuestSearch';
import { renderGuest } from './testUtils';
import { apiService } from '../../services/api';

vi.mock('../../services/api', () => ({
  apiService: {
    jukeboxSearch: vi.fn(), guestHome: vi.fn(), guestPlaylists: vi.fn(), guestCollections: vi.fn(),
    submitToJukebox: vi.fn(), guestTrackIds: vi.fn(), guestRandomTracks: vi.fn(),
    getImageUrl: (p) => (p ? `/img/${p}` : null),
  },
}));

const renderSearch = (q = 'abba') =>
  renderGuest(<GuestSearch />, { path: '/jukebox/:token/search', route: `/jukebox/tok/search?q=${q}` });

const fullResponse = {
  results: [
    { type: 'artist', data: { id: 1, name: 'ABBA', image_path: 'a.jpg', album_count: 3 } },
    { type: 'album', data: { id: 2, title: 'Arrival', image_path: 'b.jpg', artist: { id: 1, name: 'ABBA' }, track_count: 10 } },
    { type: 'playlist', data: { id: 3, name: 'Party', image_path: null, track_count: 12 } },
    { type: 'collection', data: { id: 4, name: 'Seventies', image_path: null, album_count: 4 } },
  ],
  tracks: [{ id: 10, title: 'Dancing Queen', artist: { id: 1, name: 'ABBA' }, album: { id: 2, title: 'Arrival' } }],
};

beforeEach(() => {
  vi.clearAllMocks();
  localStorage.setItem('jukebox-guest-name', 'Riley');
  apiService.jukeboxSearch.mockResolvedValue({ data: fullResponse });
  apiService.submitToJukebox.mockResolvedValue({ data: [] });
});

test('shows all four result types and tracks as "title - artist"', async () => {
  renderSearch();
  expect(await screen.findByText('ABBA', { selector: '.jukebox-guest-row-title' })).toBeInTheDocument();
  expect(screen.getByText('Arrival', { selector: '.jukebox-guest-row-title' })).toBeInTheDocument();
  expect(screen.getByText('Party')).toBeInTheDocument();
  expect(screen.getByText('Seventies')).toBeInTheDocument();
  expect(screen.getByText('Dancing Queen - ABBA')).toBeInTheDocument();
  expect(apiService.jukeboxSearch).toHaveBeenCalledWith('tok', 'abba');
});

test('artist, album, playlist and collection rows link into the guest routes', async () => {
  renderSearch();
  await screen.findByText('Party');
  const hrefs = screen.getAllByRole('link').map((a) => a.getAttribute('href'));
  expect(hrefs).toEqual(expect.arrayContaining([
    '/jukebox/tok/artist/1', '/jukebox/tok/album/2', '/jukebox/tok/playlist/3', '/jukebox/tok/collection/4',
  ]));
});

test('adding a searched track submits just that track', async () => {
  renderSearch();
  await screen.findByText('Dancing Queen - ABBA');
  fireEvent.click(screen.getByRole('button', { name: 'Add Dancing Queen to queue' }));
  await waitFor(() => expect(apiService.submitToJukebox).toHaveBeenCalledWith('tok', [10], 'Riley'));
});

test('an artist row shuffles a random batch rather than adding the whole catalog', async () => {
  apiService.guestRandomTracks.mockResolvedValue({ data: { trackIds: [21, 22] } });
  renderSearch();
  await screen.findByText('Party');
  fireEvent.click(screen.getByRole('button', { name: 'Add random tracks from ABBA' }));
  await waitFor(() => expect(apiService.guestRandomTracks).toHaveBeenCalledWith('tok', 'artist', 1));
  await waitFor(() => expect(apiService.submitToJukebox).toHaveBeenCalledWith('tok', [21, 22], 'Riley'));
  expect(apiService.guestTrackIds).not.toHaveBeenCalled();
});

test('adding an album row resolves its tracks by kind and id', async () => {
  apiService.guestTrackIds.mockResolvedValue({ data: { trackIds: [5, 6] } });
  renderSearch();
  await screen.findByText('Party');
  fireEvent.click(screen.getByRole('button', { name: 'Add Arrival to queue' }));
  await waitFor(() => expect(apiService.guestTrackIds).toHaveBeenCalledWith('tok', 'album', 2));
  await waitFor(() => expect(apiService.submitToJukebox).toHaveBeenCalledWith('tok', [5, 6], 'Riley'));
});

test('a query under three characters shows a hint and does not search', async () => {
  renderSearch('ab');
  expect(await screen.findByText(/at least 3 characters/i)).toBeInTheDocument();
  expect(apiService.jukeboxSearch).not.toHaveBeenCalled();
});

test('no results shows an empty message', async () => {
  apiService.jukeboxSearch.mockResolvedValue({ data: { results: [], tracks: [] } });
  renderSearch('zzzz');
  expect(await screen.findByText(/no results/i)).toBeInTheDocument();
});

test('tracks with a null artist or album render without crashing or "undefined"', async () => {
  apiService.jukeboxSearch.mockResolvedValue({ data: { results: [], tracks: [{ id: 11, title: 'Orphan', artist: null, album: null }, { id: 12, title: 'Nameless', artist: {} }] } });
  renderSearch();
  expect(await screen.findByText('Orphan')).toBeInTheDocument();
  expect(screen.getByText('Nameless')).toBeInTheDocument();
  expect(screen.queryByText(/undefined|\[object/)).not.toBeInTheDocument();
});

test('a failed search shows an error with retry', async () => {
  apiService.jukeboxSearch.mockRejectedValueOnce(new Error('net')).mockResolvedValue({ data: fullResponse });
  renderSearch();
  fireEvent.click(await screen.findByRole('button', { name: /try again/i }));
  expect(await screen.findByText('Party')).toBeInTheDocument();
});

test('long track lists show a preview with a show-all toggle', async () => {
  const tracks = Array.from({ length: 12 }, (_, i) => ({ id: 100 + i, title: `Song ${i + 1}`, artist: { id: 1, name: 'A' } }));
  apiService.jukeboxSearch.mockResolvedValue({ data: { results: [], tracks } });
  renderSearch();
  await screen.findByText('Song 1 - A');
  expect(screen.queryByText('Song 12 - A')).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: /show all 12/i }));
  expect(screen.getByText('Song 12 - A')).toBeInTheDocument();
});

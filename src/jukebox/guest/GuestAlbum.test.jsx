import { screen, fireEvent, waitFor } from '@testing-library/react';
import GuestAlbum from './GuestAlbum';
import { renderGuest } from './testUtils';
import { apiService } from '../../services/api';

vi.mock('../../services/api', () => ({
  apiService: {
    guestArtist: vi.fn(), guestAlbum: vi.fn(), guestPlaylist: vi.fn(), guestCollection: vi.fn(),
    submitToJukebox: vi.fn(), guestTrackIds: vi.fn(), guestRandomTracks: vi.fn(),
    getImageUrl: (p) => (p ? `/img/${p}` : null),
  },
}));

const renderAlbum = () => renderGuest(<GuestAlbum />, { path: '/jukebox/:token/album/:id', route: '/jukebox/tok/album/2' });

const albumData = {
  album: { id: 2, title: 'Arrival', release_year: '1976', image_path: 'b.jpg' },
  artist: { id: 1, name: 'ABBA' },
  tracks: [
    { id: 10, title: 'Dancing Queen', duration: 231, track_number: '1', artist: { id: 1, name: 'ABBA' }, album: { id: 2, title: 'Arrival' } },
    { id: 11, title: 'Money, Money, Money', duration: 185, track_number: '2', artist: { id: 1, name: 'ABBA' }, album: { id: 2, title: 'Arrival' } },
  ],
};

beforeEach(() => {
  vi.clearAllMocks();
  localStorage.setItem('jukebox-guest-name', 'Riley');
  apiService.guestAlbum.mockResolvedValue({ data: albumData });
  apiService.submitToJukebox.mockResolvedValue({ data: [] });
});

test('shows the album header, an artist link and every track', async () => {
  renderAlbum();
  expect(await screen.findByRole('heading', { name: 'Arrival' })).toBeInTheDocument();
  expect(screen.getByRole('link', { name: 'ABBA' })).toHaveAttribute('href', '/jukebox/tok/artist/1');
  expect(screen.getByText('Dancing Queen')).toBeInTheDocument();
  expect(screen.getByText('Money, Money, Money')).toBeInTheDocument();
  expect(apiService.guestAlbum).toHaveBeenCalledWith('tok', '2');
});

test('Add all submits the album track ids directly without another request', async () => {
  renderAlbum();
  await screen.findByText('Dancing Queen');
  fireEvent.click(screen.getByRole('button', { name: 'Add Arrival to queue' }));
  await waitFor(() => expect(apiService.submitToJukebox).toHaveBeenCalledWith('tok', [10, 11], 'Riley'));
  expect(apiService.guestTrackIds).not.toHaveBeenCalled();
});

test('a single track add submits only that track', async () => {
  renderAlbum();
  await screen.findByText('Dancing Queen');
  fireEvent.click(screen.getByRole('button', { name: 'Add Dancing Queen to queue' }));
  await waitFor(() => expect(apiService.submitToJukebox).toHaveBeenCalledWith('tok', [10], 'Riley'));
});

test('a missing album shows a not-found message', async () => {
  apiService.guestAlbum.mockRejectedValue({ response: { status: 404 } });
  renderAlbum();
  expect(await screen.findByText(/not found/i)).toBeInTheDocument();
});

test('null artist and null track artist render safely', async () => {
  apiService.guestAlbum.mockResolvedValue({ data: { ...albumData, artist: null, tracks: [{ id: 12, title: 'Orphan', artist: null, album: null }] } });
  renderAlbum();
  expect(await screen.findByText('Orphan')).toBeInTheDocument();
  expect(screen.queryByText(/undefined|\[object/)).not.toBeInTheDocument();
});

test('an album with no tracks reports nothing to add', async () => {
  apiService.guestAlbum.mockResolvedValue({ data: { ...albumData, tracks: [] } });
  renderAlbum();
  await screen.findByRole('heading', { name: 'Arrival' });
  fireEvent.click(screen.getByRole('button', { name: 'Add Arrival to queue' }));
  expect(await screen.findByText('Nothing to add')).toBeInTheDocument();
});

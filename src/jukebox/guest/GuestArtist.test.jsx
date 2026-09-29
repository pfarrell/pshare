import { screen, fireEvent, waitFor } from '@testing-library/react';
import GuestArtist from './GuestArtist';
import { renderGuest } from './testUtils';
import { apiService } from '../../services/api';

vi.mock('../../services/api', () => ({
  apiService: {
    guestArtist: vi.fn(), guestAlbum: vi.fn(), guestPlaylist: vi.fn(), guestCollection: vi.fn(),
    submitToJukebox: vi.fn(), guestTrackIds: vi.fn(), guestRandomTracks: vi.fn(),
    getImageUrl: (p) => (p ? `/img/${p}` : null),
  },
}));

const renderArtist = () => renderGuest(<GuestArtist />, { path: '/jukebox/:token/artist/:id', route: '/jukebox/tok/artist/1' });

const artistData = {
  artist: { id: 1, name: 'ABBA', image_path: 'a.jpg' },
  albums: [
    { id: 2, title: 'Arrival', release_year: '1976', image_path: 'b.jpg', artist: { id: 1, name: 'ABBA' }, track_count: 10 },
    { id: 3, title: 'Voulez-Vous', release_year: '1979', image_path: null, artist: { id: 1, name: 'ABBA' }, track_count: 1 },
  ],
  singles: [{ id: 50, title: 'Lonely Single', artist: { id: 1, name: 'ABBA' }, album: { id: 9, title: '_Singles' } }],
};

beforeEach(() => {
  vi.clearAllMocks();
  localStorage.setItem('jukebox-guest-name', 'Riley');
  apiService.guestArtist.mockResolvedValue({ data: artistData });
  apiService.guestTrackIds.mockResolvedValue({ data: { trackIds: [8, 9] } });
  apiService.guestRandomTracks.mockResolvedValue({ data: { trackIds: [1, 2, 3] } });
  apiService.submitToJukebox.mockResolvedValue({ data: [] });
});

test('shows the artist, album rows linking to album pages, and singles', async () => {
  renderArtist();
  expect(await screen.findByRole('heading', { name: 'ABBA' })).toBeInTheDocument();
  expect(screen.getByRole('link', { name: /Arrival/ })).toHaveAttribute('href', '/jukebox/tok/album/2');
  expect(screen.getByText('1979')).toBeInTheDocument();
  expect(screen.getByText('Lonely Single')).toBeInTheDocument();
});

test('the header Shuffle adds a random batch, not the whole catalog', async () => {
  renderArtist();
  await screen.findByRole('heading', { name: 'ABBA' });
  fireEvent.click(screen.getByRole('button', { name: 'Add random tracks from ABBA' }));
  await waitFor(() => expect(apiService.guestRandomTracks).toHaveBeenCalledWith('tok', 'artist', 1));
  await waitFor(() => expect(apiService.submitToJukebox).toHaveBeenCalledWith('tok', [1, 2, 3], 'Riley'));
  expect(apiService.guestTrackIds).not.toHaveBeenCalled();
});

test('an album row Add all adds just that album, not the artist catalog', async () => {
  renderArtist();
  await screen.findByRole('heading', { name: 'ABBA' });
  fireEvent.click(screen.getByRole('button', { name: 'Add Arrival to queue' }));
  await waitFor(() => expect(apiService.guestTrackIds).toHaveBeenCalledWith('tok', 'album', 2));
  await waitFor(() => expect(apiService.submitToJukebox).toHaveBeenCalledWith('tok', [8, 9], 'Riley'));
  expect(apiService.guestRandomTracks).not.toHaveBeenCalled();
});

test('an artist with no albums or singles still renders', async () => {
  apiService.guestArtist.mockResolvedValue({ data: { artist: { id: 1, name: 'Nobody', image_path: null }, albums: [], singles: [] } });
  renderArtist();
  expect(await screen.findByRole('heading', { name: 'Nobody' })).toBeInTheDocument();
});

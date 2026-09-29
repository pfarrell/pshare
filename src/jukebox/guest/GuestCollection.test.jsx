import { screen, fireEvent, waitFor } from '@testing-library/react';
import GuestCollection from './GuestCollection';
import { renderGuest } from './testUtils';
import { apiService } from '../../services/api';

vi.mock('../../services/api', () => ({
  apiService: {
    guestArtist: vi.fn(), guestAlbum: vi.fn(), guestPlaylist: vi.fn(), guestCollection: vi.fn(),
    submitToJukebox: vi.fn(), guestTrackIds: vi.fn(), guestRandomTracks: vi.fn(),
    getImageUrl: (p) => (p ? `/img/${p}` : null),
  },
}));

const renderCollection = () => renderGuest(<GuestCollection />, { path: '/jukebox/:token/collection/:id', route: '/jukebox/tok/collection/4' });

beforeEach(() => {
  vi.clearAllMocks();
  localStorage.setItem('jukebox-guest-name', 'Riley');
  apiService.guestCollection.mockResolvedValue({ data: {
    collection: { id: 4, name: 'Seventies', image_path: null },
    albums: [{ id: 2, title: 'Arrival', release_year: '1976', image_path: 'b.jpg', artist: { id: 1, name: 'ABBA' }, track_count: 0 }],
  } });
  apiService.guestRandomTracks.mockResolvedValue({ data: { trackIds: [7, 8] } });
  apiService.guestTrackIds.mockResolvedValue({ data: { trackIds: [5, 6] } });
  apiService.submitToJukebox.mockResolvedValue({ data: [] });
});

test('lists albums linking to album pages, without a zero track count', async () => {
  renderCollection();
  expect(await screen.findByRole('heading', { name: 'Seventies' })).toBeInTheDocument();
  expect(screen.getByRole('link', { name: /Arrival/ })).toHaveAttribute('href', '/jukebox/tok/album/2');
  expect(screen.queryByText(/0 tracks/)).not.toBeInTheDocument();
});

test('header Shuffle adds a random batch of the collection, never every album', async () => {
  renderCollection();
  await screen.findByRole('heading', { name: 'Seventies' });
  fireEvent.click(screen.getByRole('button', { name: 'Add random tracks from Seventies' }));
  await waitFor(() => expect(apiService.guestRandomTracks).toHaveBeenCalledWith('tok', 'collection', 4));
  await waitFor(() => expect(apiService.submitToJukebox).toHaveBeenCalledWith('tok', [7, 8], 'Riley'));
  expect(apiService.guestTrackIds).not.toHaveBeenCalled();
});

test('an album row inside a collection still adds just that album', async () => {
  renderCollection();
  await screen.findByRole('heading', { name: 'Seventies' });
  fireEvent.click(screen.getByRole('button', { name: 'Add Arrival to queue' }));
  await waitFor(() => expect(apiService.guestTrackIds).toHaveBeenCalledWith('tok', 'album', 2));
  await waitFor(() => expect(apiService.submitToJukebox).toHaveBeenCalledWith('tok', [5, 6], 'Riley'));
});

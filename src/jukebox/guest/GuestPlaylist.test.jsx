import { screen, fireEvent, waitFor } from '@testing-library/react';
import GuestPlaylist from './GuestPlaylist';
import { renderGuest } from './testUtils';
import { apiService } from '../../services/api';

vi.mock('../../services/api', () => ({
  apiService: {
    guestArtist: vi.fn(), guestAlbum: vi.fn(), guestPlaylist: vi.fn(), guestCollection: vi.fn(),
    submitToJukebox: vi.fn(), guestTrackIds: vi.fn(), guestRandomTracks: vi.fn(),
    getImageUrl: (p) => (p ? `/img/${p}` : null),
  },
}));

const renderPlaylist = () => renderGuest(<GuestPlaylist />, { path: '/jukebox/:token/playlist/:id', route: '/jukebox/tok/playlist/3' });

beforeEach(() => {
  vi.clearAllMocks();
  localStorage.setItem('jukebox-guest-name', 'Riley');
  apiService.guestPlaylist.mockResolvedValue({ data: {
    playlist: { id: 3, name: 'Party', image_path: null },
    tracks: [{ id: 10, title: 'One', artist: { id: 1, name: 'A' } }, { id: 11, title: 'Two', artist: { id: 2, name: 'B' } }],
  } });
  apiService.submitToJukebox.mockResolvedValue({ data: [] });
});

test('shows the playlist and its tracks', async () => {
  renderPlaylist();
  expect(await screen.findByRole('heading', { name: 'Party' })).toBeInTheDocument();
  expect(screen.getByText('One')).toBeInTheDocument();
  expect(screen.getByText('Two')).toBeInTheDocument();
});

test('Add all submits every playlist track in order', async () => {
  renderPlaylist();
  await screen.findByText('One');
  fireEvent.click(screen.getByRole('button', { name: 'Add Party to queue' }));
  await waitFor(() => expect(apiService.submitToJukebox).toHaveBeenCalledWith('tok', [10, 11], 'Riley'));
});

test('shows an error with retry when loading fails', async () => {
  apiService.guestPlaylist.mockRejectedValueOnce(new Error('net'));
  renderPlaylist();
  fireEvent.click(await screen.findByRole('button', { name: /try again/i }));
  expect(await screen.findByRole('heading', { name: 'Party' })).toBeInTheDocument();
});

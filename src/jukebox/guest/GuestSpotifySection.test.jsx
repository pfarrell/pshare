import { screen, fireEvent, waitFor } from '@testing-library/react';
import GuestSpotifySection from './GuestSpotifySection';
import { renderGuest } from './testUtils';
import { apiService } from '../../services/api';

vi.mock('../../services/api', () => ({
  apiService: { guestSpotifySearch: vi.fn(), guestSpotifyAlbum: vi.fn(), submitSpotifyToJukebox: vi.fn(), submitToJukebox: vi.fn() },
}));

const track = { uri: 'spotify:track:t1', id: 't1', name: 'Snooze', artists: [{ name: 'SZA' }], album: { id: 'sos', name: 'SOS', imageUrl: null }, durationMs: 1000, localId: null };
const body = {
  available: true,
  tracks: [track, { ...track, uri: 'spotify:track:own', name: 'Owned Song', localId: 9 }],
  albums: [{ id: 'sos', name: 'SOS', artists: [{ name: 'SZA' }], releaseYear: '2022', imageUrl: null, localId: null }],
  artists: [{ id: 'sza1', name: 'SZA', imageUrl: null, localId: null }],
};
const renderSection = () => renderGuest(<GuestSpotifySection query="sza" />, { path: '/jukebox/:token/search', route: '/jukebox/tok/search?q=sza' });

beforeEach(() => {
  vi.clearAllMocks();
  localStorage.setItem('jukebox-guest-name', 'Riley');
  apiService.submitSpotifyToJukebox.mockResolvedValue({ data: [] });
});

test('renders nothing while the kiosk cannot play Spotify', async () => {
  apiService.guestSpotifySearch.mockResolvedValue({ data: { available: false, tracks: [], albums: [], artists: [] } });
  const { container } = renderSection();
  await waitFor(() => expect(apiService.guestSpotifySearch).toHaveBeenCalledWith('tok', 'sza'));
  expect(container.querySelector('.jukebox-guest-spotify')).toBeNull();
});

test('shows unowned Spotify tracks, artists and albums; adding a track submits it as Spotify', async () => {
  apiService.guestSpotifySearch.mockResolvedValue({ data: body });
  renderSection();
  expect(await screen.findByText('From Spotify')).toBeInTheDocument();
  expect(screen.getByText('Snooze - SZA')).toBeInTheDocument();
  expect(screen.queryByText(/Owned Song/)).toBeNull();
  expect(screen.getByText('SZA', { selector: '.jukebox-guest-row-title' }).closest('a')).toHaveAttribute('href', '/jukebox/tok/spotify/artist/sza1');
  expect(screen.getByText('SOS', { selector: '.jukebox-guest-row-title' }).closest('a')).toHaveAttribute('href', '/jukebox/tok/spotify/album/sos');
  fireEvent.click(screen.getByRole('button', { name: 'Add Snooze to queue' }));
  await waitFor(() => expect(apiService.submitSpotifyToJukebox).toHaveBeenCalledWith('tok', [track], 'Riley'));
  expect(apiService.submitToJukebox).not.toHaveBeenCalled();
});

test('adding a Spotify album fetches its tracks and submits them all', async () => {
  apiService.guestSpotifySearch.mockResolvedValue({ data: body });
  apiService.guestSpotifyAlbum.mockResolvedValue({ data: { album: { id: 'sos', name: 'SOS' }, tracks: [track] } });
  renderSection();
  fireEvent.click(await screen.findByRole('button', { name: 'Add SOS to queue' }));
  await waitFor(() => expect(apiService.submitSpotifyToJukebox).toHaveBeenCalledWith('tok', [track], 'Riley'));
  expect(apiService.guestSpotifyAlbum).toHaveBeenCalledWith('tok', 'sos');
});

test('a failed search renders nothing', async () => {
  apiService.guestSpotifySearch.mockRejectedValue(new Error('500'));
  const { container } = renderSection();
  await waitFor(() => expect(apiService.guestSpotifySearch).toHaveBeenCalled());
  expect(container.querySelector('.jukebox-guest-spotify')).toBeNull();
});

import { screen, fireEvent, waitFor } from '@testing-library/react';
import GuestSpotifyAlbum from './GuestSpotifyAlbum';
import GuestSpotifyArtist from './GuestSpotifyArtist';
import { renderGuest } from './testUtils';
import { apiService } from '../../services/api';

vi.mock('../../services/api', () => ({
  apiService: {
    guestSpotifyAlbum: vi.fn(), guestSpotifyArtist: vi.fn(), submitSpotifyToJukebox: vi.fn(),
    submitToJukebox: vi.fn(), guestTrackIds: vi.fn(),
  },
}));

const track = (n) => ({ uri: `spotify:track:t${n}`, id: `t${n}`, name: `Song ${n}`, artists: [{ name: 'SZA' }], album: { id: 'sos', name: 'SOS', imageUrl: null }, durationMs: 61000 });

beforeEach(() => {
  vi.clearAllMocks();
  localStorage.setItem('jukebox-guest-name', 'Riley');
  apiService.submitSpotifyToJukebox.mockResolvedValue({ data: [] });
  apiService.submitToJukebox.mockResolvedValue({ data: [] });
});

describe('GuestSpotifyAlbum', () => {
  const renderAlbum = () => renderGuest(<GuestSpotifyAlbum />, { path: '/jukebox/:token/spotify/album/:id', route: '/jukebox/tok/spotify/album/sos' });

  test('lists the tracks; Add all submits every track as Spotify', async () => {
    apiService.guestSpotifyAlbum.mockResolvedValue({ data: { album: { id: 'sos', name: 'SOS', imageUrl: null, artists: [{ name: 'SZA' }] }, tracks: [track(1), track(2)] } });
    renderAlbum();
    expect(await screen.findByRole('heading', { name: 'SOS' })).toBeInTheDocument();
    expect(screen.getByText('Song 2')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Add SOS to queue' }));
    await waitFor(() => expect(apiService.submitSpotifyToJukebox).toHaveBeenCalledWith('tok', [track(1), track(2)], 'Riley'));
  });

  test('a 404 (kiosk cannot play Spotify) says not available', async () => {
    apiService.guestSpotifyAlbum.mockRejectedValue({ response: { status: 404 } });
    renderAlbum();
    expect(await screen.findByText("This album isn't available right now.")).toBeInTheDocument();
  });
});

describe('GuestSpotifyArtist', () => {
  test('owned albums open and add from the library; the rest open the Spotify album', async () => {
    apiService.guestSpotifyArtist.mockResolvedValue({ data: {
      artist: { id: 'sza1', name: 'SZA', imageUrl: null },
      albums: [
        { id: 'ctrl', name: 'Ctrl', releaseYear: '2017', imageUrl: null, localId: 9 },
        { id: 'sos', name: 'SOS', releaseYear: '2022', imageUrl: null, localId: null },
      ],
    } });
    apiService.guestTrackIds.mockResolvedValue({ data: { trackIds: [1, 2] } });
    renderGuest(<GuestSpotifyArtist />, { path: '/jukebox/:token/spotify/artist/:id', route: '/jukebox/tok/spotify/artist/sza1' });

    const titles = await screen.findAllByText(/^(SOS|Ctrl)$/, { selector: '.jukebox-guest-row-title' });
    expect(titles.map((n) => n.textContent)).toEqual(['SOS', 'Ctrl']);
    expect(titles[0].closest('a')).toHaveAttribute('href', '/jukebox/tok/spotify/album/sos');
    expect(titles[1].closest('a')).toHaveAttribute('href', '/jukebox/tok/album/9');
    fireEvent.click(screen.getByRole('button', { name: 'Add Ctrl to queue' }));
    await waitFor(() => expect(apiService.submitToJukebox).toHaveBeenCalledWith('tok', [1, 2], 'Riley'));
    expect(apiService.guestTrackIds).toHaveBeenCalledWith('tok', 'album', 9);
  });
});

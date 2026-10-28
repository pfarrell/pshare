import { screen, fireEvent, waitFor } from '@testing-library/react';
import GuestAlbum from './GuestAlbum';
import { renderGuest } from './testUtils';
import { apiService } from '../../services/api';

vi.mock('../../services/api', () => ({
  apiService: {
    guestArtist: vi.fn(), guestAlbum: vi.fn(), guestPlaylist: vi.fn(), guestCollection: vi.fn(),
    submitToJukebox: vi.fn(), guestTrackIds: vi.fn(), guestRandomTracks: vi.fn(),
    submitSpotifyToJukebox: vi.fn(), submitMixedToJukebox: vi.fn(),
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

describe('#72: an album filled from Spotify', () => {
  const sp = (position, name) => ({
    position, uri: `spotify:track:${position}`, id: `s${position}`, name, artists: [{ name: 'ABBA' }],
    album: { id: 'arr', name: 'Arrival', imageUrl: null }, durationMs: 200000,
  });
  const filled = {
    ...albumData,
    tracks: [albumData.tracks[1]],
    spotifyFill: { spotifyAlbum: { id: 'arr', name: 'Arrival', imageUrl: null }, tracks: [sp(1, 'Dancing Queen'), sp(3, 'Dum Dum Diddle')], libraryPositions: { 11: 2 } },
  };
  const titles = () => [...document.querySelectorAll('.jukebox-guest-row-title')].map((el) => el.textContent);

  beforeEach(() => {
    apiService.guestAlbum.mockResolvedValue({ data: filled });
    apiService.submitMixedToJukebox.mockResolvedValue({ data: [] });
    apiService.submitSpotifyToJukebox.mockResolvedValue({ data: [] });
  });

  test('shows the missing songs in their places, marked as Spotify', async () => {
    renderAlbum();
    await screen.findByText('Dum Dum Diddle');
    expect(titles()).toEqual(['Dancing Queen', 'Money, Money, Money', 'Dum Dum Diddle']);
    expect(document.querySelectorAll('.jukebox-guest-spotify-marker')).toHaveLength(2);
  });

  test('Add all sends the whole album in order as one mixed list', async () => {
    renderAlbum();
    await screen.findByText('Dum Dum Diddle');
    fireEvent.click(screen.getByRole('button', { name: 'Add Arrival to queue' }));
    await waitFor(() => expect(apiService.submitMixedToJukebox).toHaveBeenCalled());
    const [token, items, name] = apiService.submitMixedToJukebox.mock.calls[0];
    expect(token).toBe('tok');
    expect(name).toBe('Riley');
    expect(items.map((i) => i.trackId ?? i.spotifyTrack.uri)).toEqual(['spotify:track:1', 11, 'spotify:track:3']);
    expect(apiService.submitToJukebox).not.toHaveBeenCalled();
  });

  test('a filled song adds just that Spotify track', async () => {
    renderAlbum();
    await screen.findByText('Dum Dum Diddle');
    fireEvent.click(screen.getByRole('button', { name: 'Add Dum Dum Diddle to queue' }));
    await waitFor(() => expect(apiService.submitSpotifyToJukebox).toHaveBeenCalled());
    expect(apiService.submitSpotifyToJukebox.mock.calls[0][1].map((t) => t.uri)).toEqual(['spotify:track:3']);
  });

  test('Add all shows "Spotify is off" when the kiosk refuses Spotify tracks', async () => {
    apiService.submitMixedToJukebox.mockRejectedValue({ response: { status: 409 } });
    renderAlbum();
    await screen.findByText('Dum Dum Diddle');
    fireEvent.click(screen.getByRole('button', { name: 'Add Arrival to queue' }));
    expect(await screen.findByText('Spotify is off')).toBeInTheDocument();
  });

  test('a malformed spotifyFill is ignored', async () => {
    apiService.guestAlbum.mockResolvedValue({ data: { ...albumData, spotifyFill: { tracks: 'junk' } } });
    renderAlbum();
    await screen.findByText('Dancing Queen');
    expect(titles()).toEqual(['Dancing Queen', 'Money, Money, Money']);
  });
});

import { describe, test, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';

const canPlay = { value: true, checking: false };
vi.mock('../player/spotify/useCanPlaySpotify', () => ({
  useCanPlaySpotify: () => canPlay.value,
  useSpotifyPlayability: () => (canPlay.value ? 'ready' : canPlay.checking ? 'checking' : 'unavailable'),
}));
vi.mock('../services/api', () => ({ apiService: { getSpotifyAlbumDetails: vi.fn(), getImageUrl: vi.fn(() => null) } }));

import { apiService } from '../services/api';
import { usePlayerStore } from '../stores/playerStore';
import SpotifyAlbum from './SpotifyAlbum';

const payload = {
  configured: true,
  album: { id: 'lov', name: 'Lover', imageUrl: 'https://i.scdn.co/lover.jpg', artists: [{ id: 'ts', name: 'Taylor Swift' }] },
  tracks: [
    { uri: 'spotify:track:1', id: '1', name: 'I Forgot That You Existed', artists: [{ name: 'Taylor Swift' }], durationMs: 170000 },
    { uri: 'spotify:track:2', id: '2', name: 'Cruel Summer', artists: [{ name: 'Taylor Swift' }], durationMs: 178000 },
  ],
};

const renderPage = (path = '/spotify/album/lov', state) => render(
  <MemoryRouter initialEntries={[{ pathname: path, state }]}>
    <Routes>
      <Route path="/spotify/album/:spotifyId" element={<SpotifyAlbum />} />
      <Route path="/artist/:id" element={<div>artist page</div>} />
      <Route path="/spotify/artist/:id" element={<div>spotify artist page</div>} />
    </Routes>
  </MemoryRouter>,
);

let addTracks;
let prevAddTracks;
beforeEach(() => {
  canPlay.value = true;
  canPlay.checking = false;
  apiService.getSpotifyAlbumDetails.mockReset();
  addTracks = vi.fn();
  prevAddTracks = usePlayerStore.getState().addTracks;
  usePlayerStore.setState({ addTracks });
  return () => usePlayerStore.setState({ addTracks: prevAddTracks });
});

describe('SpotifyAlbum page', () => {
  test('renders the album like a library album: header, meta line, About, track rows', async () => {
    apiService.getSpotifyAlbumDetails.mockResolvedValue({ data: {
      ...payload,
      album: { ...payload.album, releaseYear: '2019', label: 'Republic' },
      summary: { summary: 'Lover is the seventh studio album by Taylor Swift.', url: 'https://en.wikipedia.org/wiki/Lover_(album)' },
      localArtistId: null,
    } });
    renderPage();
    expect(await screen.findByRole('heading', { name: 'Lover' })).toBeInTheDocument();
    expect(screen.getByText('2019 · Republic · From Spotify')).toBeInTheDocument();
    expect(screen.getByText('About this album')).toBeInTheDocument();
    expect(screen.getByText(/seventh studio album/)).toBeInTheDocument();
    expect(screen.getByText(/Cruel Summer/)).toBeInTheDocument();
    expect(screen.queryByText(/Cruel Summer - Taylor Swift/)).toBeNull();
    expect(screen.getByRole('link', { name: 'Open Lover in Spotify' })).toBeInTheDocument();
  });

  test('no Wikipedia match just leaves the About section out', async () => {
    apiService.getSpotifyAlbumDetails.mockResolvedValue({ data: { ...payload, summary: null } });
    renderPage();
    await screen.findByRole('heading', { name: 'Lover' });
    expect(screen.queryByText('About this album')).toBeNull();
  });

  test('Play enqueues the whole album immediately; a row play button adds that track', async () => {
    apiService.getSpotifyAlbumDetails.mockResolvedValue({ data: payload });
    renderPage();
    await screen.findByRole('heading', { name: 'Lover' });
    fireEvent.click(screen.getAllByRole('button', { name: 'Play' })[0]);
    await waitFor(() => expect(addTracks).toHaveBeenCalledTimes(1));
    expect(addTracks.mock.calls[0][0].map((t) => t.uri)).toEqual(['spotify:track:1', 'spotify:track:2']);
    expect(addTracks.mock.calls[0][2]).toMatchObject({ playImmediately: true });
  });

  test('artist links to the library artist (state or response), else the Spotify artist page', async () => {
    apiService.getSpotifyAlbumDetails.mockResolvedValue({ data: { ...payload, localArtistId: 7 } });
    const first = renderPage();
    fireEvent.click(await screen.findByRole('link', { name: 'Taylor Swift' }));
    expect(screen.getByText('artist page')).toBeInTheDocument();
    first.unmount();

    apiService.getSpotifyAlbumDetails.mockResolvedValue({ data: { ...payload, localArtistId: null } });
    renderPage();
    fireEvent.click(await screen.findByRole('link', { name: 'Taylor Swift' }));
    expect(screen.getByText('spotify artist page')).toBeInTheDocument();
  });

  test('invalid id shows the empty state without calling the API', async () => {
    renderPage('/spotify/album/bad-id!');
    expect(await screen.findByText("This album isn't available right now.")).toBeInTheDocument();
    expect(apiService.getSpotifyAlbumDetails).not.toHaveBeenCalled();
  });

  test('while eligibility is still being checked it shows loading, not the unavailable message', async () => {
    canPlay.value = false;
    canPlay.checking = true;
    renderPage();
    await new Promise((r) => setTimeout(r, 0));
    expect(screen.queryByText("This album isn't available right now.")).toBeNull();
    expect(apiService.getSpotifyAlbumDetails).not.toHaveBeenCalled();
  });

  test('ineligible session shows the empty state without calling the API', async () => {
    canPlay.value = false;
    renderPage();
    expect(await screen.findByText("This album isn't available right now.")).toBeInTheDocument();
    expect(apiService.getSpotifyAlbumDetails).not.toHaveBeenCalled();
  });

  test('request failure and configured:false show the empty state', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    apiService.getSpotifyAlbumDetails.mockRejectedValue(new Error('502'));
    const { unmount } = renderPage();
    expect(await screen.findByText("This album isn't available right now.")).toBeInTheDocument();
    unmount();
    apiService.getSpotifyAlbumDetails.mockResolvedValue({ data: { configured: false, album: null, tracks: [] } });
    renderPage();
    expect(await screen.findByText("This album isn't available right now.")).toBeInTheDocument();
    warn.mockRestore();
  });

  test('null imageUrl, empty artists and durationMs 0 render without throwing', async () => {
    apiService.getSpotifyAlbumDetails.mockResolvedValue({ data: {
      configured: true,
      album: { id: 'x', name: 'Bare', imageUrl: null, artists: [] },
      tracks: [{ uri: 'spotify:track:9', id: '9', name: 'Silent', artists: null, durationMs: 0 }],
    } });
    renderPage('/spotify/album/x');
    expect(await screen.findByText(/Silent/)).toBeInTheDocument();
  });
});

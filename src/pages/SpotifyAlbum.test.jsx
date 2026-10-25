import { describe, test, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';

const canPlay = { value: true };
vi.mock('../player/spotify/useCanPlaySpotify', () => ({ useCanPlaySpotify: () => canPlay.value }));
vi.mock('../services/api', () => ({ apiService: { getSpotifyAlbumTracks: vi.fn() } }));

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
    </Routes>
  </MemoryRouter>,
);

let addTracks;
let prevAddTracks;
beforeEach(() => {
  canPlay.value = true;
  apiService.getSpotifyAlbumTracks.mockReset();
  addTracks = vi.fn();
  prevAddTracks = usePlayerStore.getState().addTracks;
  usePlayerStore.setState({ addTracks });
  return () => usePlayerStore.setState({ addTracks: prevAddTracks });
});

describe('SpotifyAlbum page', () => {
  test('renders header and tracks for an eligible session', async () => {
    apiService.getSpotifyAlbumTracks.mockResolvedValue({ data: payload });
    renderPage('/spotify/album/lov', { localArtistId: 5, year: '2019' });
    expect(await screen.findByRole('heading', { name: 'Lover' })).toBeInTheDocument();
    expect(screen.getByText('Cruel Summer')).toBeInTheDocument();
    expect(screen.getByText('2:58')).toBeInTheDocument();
    expect(screen.getByText('2019')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Open Lover in Spotify' })).toBeInTheDocument();
  });

  test('Play enqueues all tracks immediately; per-track Add enqueues one', async () => {
    apiService.getSpotifyAlbumTracks.mockResolvedValue({ data: payload });
    renderPage();
    await screen.findByText('Cruel Summer');
    fireEvent.click(screen.getByRole('button', { name: 'Play Lover' }));
    await waitFor(() => expect(addTracks).toHaveBeenCalledTimes(1));
    expect(addTracks.mock.calls[0][0].map((t) => t.uri)).toEqual(['spotify:track:1', 'spotify:track:2']);
    expect(addTracks.mock.calls[0][2]).toMatchObject({ playImmediately: true });

    fireEvent.click(screen.getByRole('button', { name: 'Add Cruel Summer to queue' }));
    await waitFor(() => expect(addTracks).toHaveBeenCalledTimes(2));
    expect(addTracks.mock.calls[1][0].map((t) => t.uri)).toEqual(['spotify:track:2']);
  });

  test('artist name links back when localArtistId state is present, plain text otherwise', async () => {
    apiService.getSpotifyAlbumTracks.mockResolvedValue({ data: payload });
    const { unmount } = renderPage('/spotify/album/lov', { localArtistId: 5 });
    fireEvent.click(await screen.findByRole('link', { name: 'Taylor Swift' }));
    expect(screen.getByText('artist page')).toBeInTheDocument();
    unmount();

    renderPage();
    await screen.findByText('Cruel Summer');
    expect(screen.queryByRole('link', { name: 'Taylor Swift' })).toBeNull();
    expect(screen.getByText('Taylor Swift')).toBeInTheDocument();
  });

  test('invalid id shows the empty state without calling the API', async () => {
    renderPage('/spotify/album/bad-id!');
    expect(await screen.findByText("This album isn't available right now.")).toBeInTheDocument();
    expect(apiService.getSpotifyAlbumTracks).not.toHaveBeenCalled();
  });

  test('ineligible session shows the empty state without calling the API', async () => {
    canPlay.value = false;
    renderPage();
    expect(await screen.findByText("This album isn't available right now.")).toBeInTheDocument();
    expect(apiService.getSpotifyAlbumTracks).not.toHaveBeenCalled();
  });

  test('request failure and configured:false show the empty state', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    apiService.getSpotifyAlbumTracks.mockRejectedValue(new Error('502'));
    const { unmount } = renderPage();
    expect(await screen.findByText("This album isn't available right now.")).toBeInTheDocument();
    unmount();
    apiService.getSpotifyAlbumTracks.mockResolvedValue({ data: { configured: false, album: null, tracks: [] } });
    renderPage();
    expect(await screen.findByText("This album isn't available right now.")).toBeInTheDocument();
    warn.mockRestore();
  });

  test('null imageUrl, empty artists and durationMs 0 render without throwing', async () => {
    apiService.getSpotifyAlbumTracks.mockResolvedValue({ data: {
      configured: true,
      album: { id: 'x', name: 'Bare', imageUrl: null, artists: [] },
      tracks: [{ uri: 'spotify:track:9', id: '9', name: 'Silent', artists: null, durationMs: 0 }],
    } });
    renderPage('/spotify/album/x');
    expect(await screen.findByText('Silent')).toBeInTheDocument();
  });
});

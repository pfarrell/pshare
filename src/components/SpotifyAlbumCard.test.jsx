import { describe, test, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter, Routes, Route, useLocation } from 'react-router-dom';

vi.mock('../services/api', () => ({ apiService: { getSpotifyAlbumTracks: vi.fn() } }));

import { apiService } from '../services/api';
import { usePlayerStore } from '../stores/playerStore';
import SpotifyAlbumCard from './SpotifyAlbumCard';

const album = { id: 'lov', name: 'Lover', releaseYear: '2019', imageUrl: 'https://i.scdn.co/lover.jpg', artists: [{ name: 'Taylor Swift' }] };

const Where = () => {
  const loc = useLocation();
  return <div data-testid="where">{loc.pathname}|{loc.state?.localArtistId ?? ''}</div>;
};
const renderCard = (a = album) => render(
  <MemoryRouter initialEntries={['/artist/5']}>
    <Routes>
      <Route path="/artist/5" element={<SpotifyAlbumCard album={a} localArtistId={5} />} />
      <Route path="/spotify/album/:id" element={<Where />} />
    </Routes>
  </MemoryRouter>,
);

beforeEach(() => apiService.getSpotifyAlbumTracks.mockReset());

describe('SpotifyAlbumCard', () => {
  test('renders the corner marker, title and year', () => {
    const { container } = renderCard();
    expect(screen.getByText('Lover')).toBeInTheDocument();
    expect(screen.getByText('2019')).toBeInTheDocument();
    expect(container.querySelector('.spotify-album-marker')).not.toBeNull();
  });

  test('click navigates to the Spotify album page with localArtistId state', () => {
    renderCard();
    fireEvent.click(screen.getByText('Lover'));
    expect(screen.getByTestId('where')).toHaveTextContent('/spotify/album/lov|5');
  });

  test("play enqueues the album's tracks", async () => {
    const addTracks = vi.fn();
    const prev = usePlayerStore.getState().addTracks;
    usePlayerStore.setState({ addTracks });
    apiService.getSpotifyAlbumTracks.mockResolvedValue({
      data: { configured: true, album: { id: 'lov', name: 'Lover', imageUrl: null }, tracks: [{ uri: 'spotify:track:1', id: '1', name: 'Cruel Summer', artists: [{ name: 'Taylor Swift' }], durationMs: 178000 }] },
    });
    renderCard();
    fireEvent.click(screen.getByRole('button', { name: 'Play Lover' }));
    await waitFor(() => expect(addTracks).toHaveBeenCalled());
    expect(apiService.getSpotifyAlbumTracks).toHaveBeenCalledWith('lov');
    expect(addTracks.mock.calls[0][0][0]).toMatchObject({ source: 'spotify', uri: 'spotify:track:1', title: 'Cruel Summer' });
    usePlayerStore.setState({ addTracks: prev });
  });

  test('a null imageUrl and missing year render without throwing', () => {
    renderCard({ id: 'x', name: 'Bare', releaseYear: null, imageUrl: null, artists: null });
    expect(screen.getByText('Bare')).toBeInTheDocument();
  });
});

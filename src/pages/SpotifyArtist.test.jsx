import { describe, test, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';

const result = { value: { status: 'loading' } };
vi.mock('../player/spotify/useSpotifyCatalogArtist', () => ({ useSpotifyCatalogArtist: () => result.value }));
vi.mock('../services/api', () => ({ apiService: { getSpotifyAlbumTracks: vi.fn(), getAlbum: vi.fn() } }));

import SpotifyArtist from './SpotifyArtist';

const renderPage = () => render(
  <MemoryRouter initialEntries={['/spotify/artist/sza1']}>
    <Routes>
      <Route path="/spotify/artist/:spotifyId" element={<SpotifyArtist />} />
    </Routes>
  </MemoryRouter>,
);

beforeEach(() => { result.value = { status: 'loading' }; });

describe('SpotifyArtist', () => {
  test('shows the quiet empty state when unavailable', () => {
    result.value = { status: 'unavailable' };
    renderPage();
    expect(screen.getByText("This artist isn't available right now.")).toBeInTheDocument();
  });

  test('renders the artist and every album newest first, owned ones without the Spotify marker', () => {
    result.value = {
      status: 'ready',
      artist: { id: 'sza1', name: 'SZA', imageUrl: null, externalUrl: 'https://open.spotify.com/artist/sza1' },
      albums: [
        { id: 'ctrl', name: 'Ctrl', releaseYear: '2017', localId: 9 },
        { id: 'sos', name: 'SOS', releaseYear: '2022', localId: null },
      ],
    };
    const { container } = renderPage();
    expect(screen.getByRole('heading', { name: 'SZA' })).toBeInTheDocument();
    const titles = [...container.querySelectorAll('h3')].map((h) => h.textContent);
    expect(titles.indexOf('SOS')).toBeLessThan(titles.indexOf('Ctrl'));
    expect(container.querySelectorAll('.spotify-album-marker')).toHaveLength(1);
  });

  test('says so when the artist has no albums', () => {
    result.value = { status: 'ready', artist: { id: 'x', name: 'X' }, albums: [] };
    renderPage();
    expect(screen.getByText('No albums found.')).toBeInTheDocument();
  });
});

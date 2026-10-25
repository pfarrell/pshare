import { describe, test, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

const result = { value: { status: 'loading' } };
vi.mock('../player/spotify/useSpotifyCatalogArtist', () => ({ useSpotifyCatalogArtist: () => result.value }));

import JukeboxSpotifyArtistView from './JukeboxSpotifyArtistView';

const artist = { id: 'sza1', name: 'SZA', source: 'spotify' };
beforeEach(() => { result.value = { status: 'loading' }; });

describe('JukeboxSpotifyArtistView', () => {
  test('loading, then unavailable, never throw', () => {
    const { rerender } = render(<JukeboxSpotifyArtistView artist={artist} onSelectAlbum={vi.fn()} onBack={vi.fn()} />);
    expect(screen.getByText('Loading…')).toBeInTheDocument();
    result.value = { status: 'unavailable' };
    rerender(<JukeboxSpotifyArtistView artist={artist} onSelectAlbum={vi.fn()} onBack={vi.fn()} />);
    expect(screen.getByText("This artist isn't available right now")).toBeInTheDocument();
  });

  test('owned albums open as library albums, the rest as Spotify albums; newest first', () => {
    const onSelectAlbum = vi.fn();
    result.value = {
      status: 'ready',
      artist: { id: 'sza1', name: 'SZA' },
      albums: [
        { id: 'ctrl', name: 'Ctrl', releaseYear: '2017', imageUrl: 'https://i/ctrl', localId: 9 },
        { id: 'sos', name: 'SOS', releaseYear: '2022', imageUrl: 'https://i/sos', localId: null },
      ],
    };
    const { container } = render(<JukeboxSpotifyArtistView artist={artist} onSelectAlbum={onSelectAlbum} onBack={vi.fn()} />);
    const titles = [...container.querySelectorAll('.jukebox-album-tile-title')].map((n) => n.textContent);
    expect(titles).toEqual(['SOS', 'Ctrl']);
    expect(container.querySelectorAll('.jukebox-album-tile-badge')).toHaveLength(1);
    fireEvent.click(screen.getByText('SOS'));
    expect(onSelectAlbum).toHaveBeenLastCalledWith(expect.objectContaining({ id: 'sos', source: 'spotify', title: 'SOS' }));
    fireEvent.click(screen.getByText('Ctrl'));
    expect(onSelectAlbum).toHaveBeenLastCalledWith({ id: 9, title: 'Ctrl', artist: { name: 'SZA' } });
  });

  test('back pops the view', () => {
    const onBack = vi.fn();
    render(<JukeboxSpotifyArtistView artist={artist} onSelectAlbum={vi.fn()} onBack={onBack} />);
    fireEvent.click(screen.getByText('‹ Back'));
    expect(onBack).toHaveBeenCalled();
  });
});

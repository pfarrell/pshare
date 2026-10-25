import { describe, test, expect, vi, beforeEach } from 'vitest';
import { render as rtlRender, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

// Track rows use the router.
const render = (ui) => rtlRender(<MemoryRouter>{ui}</MemoryRouter>);

vi.mock('../services/api', () => ({ apiService: { getSpotifyAlbumTracks: vi.fn(), getImageUrl: vi.fn() } }));

import { apiService } from '../services/api';
import { usePlayerStore } from '../stores/playerStore';
import JukeboxSpotifyTracksPanel from './JukeboxSpotifyTracksPanel';

const album = { id: 'lov', title: 'Lover', source: 'spotify', imageUrl: 'https://i.scdn.co/lover.jpg', artist: { name: 'Taylor Swift' } };
const payload = {
  configured: true,
  album: { id: 'lov', name: 'Lover', imageUrl: 'https://i.scdn.co/lover.jpg', artists: [{ name: 'Taylor Swift' }] },
  tracks: [
    { uri: 'spotify:track:1', id: '1', name: 'I Forgot That You Existed', artists: [{ name: 'Taylor Swift' }], durationMs: 170000 },
    { uri: 'spotify:track:2', id: '2', name: 'Cruel Summer', artists: [{ name: 'Taylor Swift' }], durationMs: 178000 },
  ],
};

let addTracks; let addTrack; let prev;
beforeEach(() => {
  apiService.getSpotifyAlbumTracks.mockReset();
  addTracks = vi.fn(); addTrack = vi.fn();
  prev = { addTracks: usePlayerStore.getState().addTracks, addTrack: usePlayerStore.getState().addTrack };
  usePlayerStore.setState({ addTracks, addTrack, playlist: [] });
  return () => usePlayerStore.setState(prev);
});

describe('JukeboxSpotifyTracksPanel', () => {
  test("loads and lists the album's Spotify tracks with the cover", async () => {
    apiService.getSpotifyAlbumTracks.mockResolvedValue({ data: payload });
    const { container } = render(<JukeboxSpotifyTracksPanel album={album} onClose={vi.fn()} />);
    expect(await screen.findByText(/Cruel Summer/)).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Lover' })).toBeInTheDocument();
    expect(screen.getByText('Taylor Swift', { selector: '.jukebox-tracks-panel-artist' })).toBeInTheDocument();
    expect(container.querySelector('img.jukebox-tracks-panel-art').getAttribute('src')).toBe('https://i.scdn.co/lover.jpg');
    expect(apiService.getSpotifyAlbumTracks).toHaveBeenCalledWith('lov');
  });

  test('Play album and Add to queue enqueue every track and call onEnqueue', async () => {
    const onEnqueue = vi.fn();
    apiService.getSpotifyAlbumTracks.mockResolvedValue({ data: payload });
    render(<JukeboxSpotifyTracksPanel album={album} onClose={vi.fn()} onEnqueue={onEnqueue} />);
    await screen.findByText(/Cruel Summer/);
    fireEvent.click(screen.getByRole('button', { name: 'Add to queue' }));
    await waitFor(() => expect(addTracks).toHaveBeenCalledTimes(1));
    expect(addTracks.mock.calls[0][0].map((t) => t.uri)).toEqual(['spotify:track:1', 'spotify:track:2']);
    expect(addTracks.mock.calls[0][0][0]).toMatchObject({ source: 'spotify' });
    fireEvent.click(screen.getByRole('button', { name: 'Play album' }));
    await waitFor(() => expect(addTracks).toHaveBeenCalledTimes(2));
    expect(onEnqueue).toHaveBeenCalledTimes(2);
  });

  test('tapping a track adds just that track', async () => {
    const onEnqueue = vi.fn();
    apiService.getSpotifyAlbumTracks.mockResolvedValue({ data: payload });
    render(<JukeboxSpotifyTracksPanel album={album} onClose={vi.fn()} onEnqueue={onEnqueue} />);
    fireEvent.click(await screen.findByText(/Cruel Summer/));
    await waitFor(() => expect(addTrack).toHaveBeenCalledTimes(1));
    expect(addTrack.mock.calls[0][0]).toMatchObject({ source: 'spotify', uri: 'spotify:track:2' });
    expect(onEnqueue).toHaveBeenCalled();
  });

  test('a failed load shows the kiosk error with Retry', async () => {
    apiService.getSpotifyAlbumTracks.mockRejectedValueOnce(new Error('502')).mockResolvedValueOnce({ data: payload });
    render(<JukeboxSpotifyTracksPanel album={album} onClose={vi.fn()} />);
    fireEvent.click(await screen.findByRole('button', { name: 'Retry' }));
    expect(await screen.findByText(/Cruel Summer/)).toBeInTheDocument();
  });

  test('configured:false and a missing cover render without throwing', async () => {
    apiService.getSpotifyAlbumTracks.mockResolvedValue({ data: { configured: false, album: null, tracks: [] } });
    render(<JukeboxSpotifyTracksPanel album={{ ...album, imageUrl: null }} onClose={vi.fn()} />);
    expect(await screen.findByText('Failed to load album.')).toBeInTheDocument();
  });
});

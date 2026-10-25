import { describe, test, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

const canPlay = { value: true };
vi.mock('../player/spotify/useCanPlaySpotify', () => ({ useCanPlaySpotify: () => canPlay.value }));
vi.mock('../services/api', () => ({ apiService: { searchSpotify: vi.fn(), getSpotifyAlbumTracks: vi.fn() } }));

import { apiService } from '../services/api';
import { usePlayerStore } from '../stores/playerStore';
import JukeboxSpotifySection from './JukeboxSpotifySection';

const searchBody = {
  configured: true,
  artists: [],
  albums: [
    { id: 'lov', name: 'Lover', artists: [{ name: 'Taylor Swift' }], releaseYear: '2019', imageUrl: null, localId: null },
    { id: 'own', name: 'Fearless', artists: [{ name: 'Taylor Swift' }], releaseYear: '2008', imageUrl: null, localId: 9 },
  ],
  tracks: [
    { uri: 'spotify:track:1', id: '1', name: 'Cruel Summer', artists: [{ name: 'Taylor Swift' }], album: { name: 'Lover' }, durationMs: 178000, localId: null },
  ],
};

let addTracks;
let prev;
beforeEach(() => {
  canPlay.value = true;
  apiService.searchSpotify.mockReset();
  apiService.getSpotifyAlbumTracks.mockReset();
  addTracks = vi.fn();
  prev = usePlayerStore.getState().addTracks;
  usePlayerStore.setState({ addTracks });
  return () => usePlayerStore.setState({ addTracks: prev });
});

describe('JukeboxSpotifySection', () => {
  test('renders nothing and makes no request when the kiosk cannot play Spotify', async () => {
    canPlay.value = false;
    const { container } = render(<JukeboxSpotifySection query="taylor" />);
    await new Promise((r) => setTimeout(r, 0));
    expect(apiService.searchSpotify).not.toHaveBeenCalled();
    expect(container).toBeEmptyDOMElement();
  });

  test('shows unowned Spotify albums and tracks, hiding library matches', async () => {
    apiService.searchSpotify.mockResolvedValue({ data: searchBody });
    render(<JukeboxSpotifySection query="taylor" />);
    expect(await screen.findByText('Lover')).toBeInTheDocument();
    expect(screen.getByText('Cruel Summer')).toBeInTheDocument();
    expect(screen.queryByText('Fearless')).toBeNull();
    expect(apiService.searchSpotify).toHaveBeenCalledWith('taylor');
  });

  test('tapping a track adds one Spotify entry to the queue (no play-now) and calls onEnqueue', async () => {
    const onEnqueue = vi.fn();
    apiService.searchSpotify.mockResolvedValue({ data: searchBody });
    render(<JukeboxSpotifySection query="taylor" onEnqueue={onEnqueue} />);
    fireEvent.click(await screen.findByRole('button', { name: 'Add Cruel Summer to queue' }));
    await waitFor(() => expect(addTracks).toHaveBeenCalledTimes(1));
    expect(addTracks.mock.calls[0][0].map((t) => t.uri)).toEqual(['spotify:track:1']);
    expect(addTracks.mock.calls[0][2]?.playImmediately).toBeFalsy();
    expect(onEnqueue).toHaveBeenCalled();
  });

  test("tapping an album adds all of its tracks", async () => {
    apiService.searchSpotify.mockResolvedValue({ data: searchBody });
    apiService.getSpotifyAlbumTracks.mockResolvedValue({ data: {
      configured: true, album: { id: 'lov', name: 'Lover', imageUrl: null },
      tracks: [
        { uri: 'spotify:track:1', id: '1', name: 'Cruel Summer', artists: [{ name: 'Taylor Swift' }], durationMs: 1 },
        { uri: 'spotify:track:2', id: '2', name: 'Lover', artists: [{ name: 'Taylor Swift' }], durationMs: 1 },
      ],
    } });
    render(<JukeboxSpotifySection query="taylor" />);
    fireEvent.click(await screen.findByRole('button', { name: 'Add Lover to queue' }));
    await waitFor(() => expect(addTracks).toHaveBeenCalledTimes(1));
    expect(addTracks.mock.calls[0][0].map((t) => t.uri)).toEqual(['spotify:track:1', 'spotify:track:2']);
  });

  test('a failed search renders nothing', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    apiService.searchSpotify.mockRejectedValue(new Error('502'));
    const { container } = render(<JukeboxSpotifySection query="taylor" />);
    await waitFor(() => expect(apiService.searchSpotify).toHaveBeenCalled());
    await new Promise((r) => setTimeout(r, 0));
    expect(container).toBeEmptyDOMElement();
    warn.mockRestore();
  });

  test('a newer query replaces older results', async () => {
    let resolveOld;
    apiService.searchSpotify.mockImplementation((q) => (q === 'old'
      ? new Promise((r) => { resolveOld = r; })
      : Promise.resolve({ data: { ...searchBody, albums: [], tracks: [{ ...searchBody.tracks[0], name: 'New Song' }] } })));
    const { rerender } = render(<JukeboxSpotifySection query="old" />);
    rerender(<JukeboxSpotifySection query="new" />);
    expect(await screen.findByText('New Song')).toBeInTheDocument();
    resolveOld({ data: searchBody });
    await new Promise((r) => setTimeout(r, 0));
    expect(screen.queryByText('Cruel Summer')).toBeNull();
  });
});

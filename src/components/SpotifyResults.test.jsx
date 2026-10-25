import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { apiService } from '../services/api';
import SpotifyResults from './SpotifyResults';
import { usePlayerStore } from '../stores/playerStore';
import { useViewModeStore } from '../stores/viewModeStore';

vi.mock('../services/api', () => ({ apiService: { getSpotifyAlbumTracks: vi.fn() } }));

beforeEach(() => {
  useViewModeStore.setState({ mode: 'card' });
});

test('renders nothing when every group is empty', () => {
  const { container } = render(<SpotifyResults artists={[]} albums={[]} tracks={[]} />);
  expect(container).toBeEmptyDOMElement();
});

test('renders only a loading indicator while pending', () => {
  render(<SpotifyResults loading />);
  expect(screen.getByTestId('spotify-loading')).toBeInTheDocument();
  expect(screen.queryByText('From Spotify')).toBeNull();
});

test('omits empty groups', () => {
  render(<SpotifyResults artists={[{ id: 'r', name: 'Only Artist', imageUrl: null, externalUrl: 'https://open.spotify.com/artist/r' }]} />);
  expect(screen.getByText('Artists')).toBeInTheDocument();
  expect(screen.queryByText('Albums')).toBeNull();
  expect(screen.queryByText('Tracks')).toBeNull();
});

test('labels cards as Spotify in card mode and renders rows in list mode', () => {
  const albums = [{ id: 'a', name: 'Some Album', artists: [{ name: 'X' }], imageUrl: null, externalUrl: 'https://open.spotify.com/album/a' }];
  const { container, rerender } = render(<SpotifyResults albums={albums} />);
  expect(screen.getByText('SPOTIFY')).toBeInTheDocument();
  expect(container.querySelector('.artist-card.spotify-result')).not.toBeNull();

  useViewModeStore.setState({ mode: 'list' });
  rerender(<SpotifyResults albums={albums} />);
  expect(container.querySelector('.result-row.spotify-result')).not.toBeNull();
  expect(screen.getByRole('link', { name: 'Open Some Album in Spotify' })).toBeInTheDocument();
});

test('the open-in-Spotify link is a logo with an offsite arrow, not text', () => {
  const albums = [{ id: 'a', name: 'Some Album', artists: [{ name: 'X' }], imageUrl: null, externalUrl: 'https://open.spotify.com/album/a' }];
  render(<SpotifyResults albums={albums} />);
  const link = screen.getByRole('link', { name: 'Open Some Album in Spotify' });
  expect(link).toHaveAttribute('href', 'https://open.spotify.com/album/a');
  expect(link).toHaveAttribute('target', '_blank');
  expect(link.querySelector('svg.spotify-open-logo')).not.toBeNull();
  expect(link).toHaveTextContent('↗');
  expect(link).not.toHaveTextContent('Open in Spotify');
});

test('falls back to a placeholder when an image fails to load', () => {
  const { container } = render(
    <SpotifyResults albums={[{ id: 'a', name: 'Broken Art', artists: [], imageUrl: 'https://i.scdn.co/broken.jpg', externalUrl: 'https://open.spotify.com/album/a' }]} />
  );
  fireEvent.error(screen.getByAltText('Broken Art'));
  expect(screen.queryByAltText('Broken Art')).toBeNull();
  expect(container.querySelector('.spotify-image-fallback')).not.toBeNull();
});

test('never renders a non-string name as a child', () => {
  render(<SpotifyResults artists={[{ id: 'r', name: { bogus: true }, imageUrl: null }]} />);
  expect(screen.getByText('Artists')).toBeInTheDocument();
});

test('clicking a Spotify item does not touch the player queue', () => {
  const before = usePlayerStore.getState().playlist;
  render(<SpotifyResults tracks={[{ id: 't', name: 'Ext Track', artists: [{ name: 'A' }], album: { name: 'B', imageUrl: null }, durationMs: 1000, externalUrl: 'https://open.spotify.com/track/t' }]} />);
  fireEvent.click(screen.getByText('Ext Track'));
  expect(usePlayerStore.getState().playlist).toBe(before);
});

describe('canPlay', () => {
  const track = { id: 't1', uri: 'spotify:track:t1', name: 'Ext Track', artists: [{ name: 'A' }], album: { name: 'B', imageUrl: null }, durationMs: 0, externalUrl: 'https://open.spotify.com/track/t1' };
  const album = { id: 'al1', name: 'Some Album', artists: [], imageUrl: null, externalUrl: 'https://open.spotify.com/album/al1' };

  beforeEach(() => {
    apiService.getSpotifyAlbumTracks.mockReset();
    usePlayerStore.setState({ addTracks: vi.fn() });
  });

  test('canPlay=false renders no play buttons', () => {
    render(<SpotifyResults tracks={[track]} albums={[album]} />);
    expect(screen.queryByRole('button')).toBeNull();
  });

  test('canPlay=true: playing a track calls addTracks with one Spotify queue entry and playImmediately', () => {
    render(<SpotifyResults canPlay tracks={[track]} />);
    fireEvent.click(screen.getByRole('button', { name: 'Play Ext Track' }));
    const [entries, next, opts] = usePlayerStore.getState().addTracks.mock.calls[0];
    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({ source: 'spotify', uri: 'spotify:track:t1', duration: 0 });
    expect(entries[0].id).toBeUndefined();
    expect(next).toBe(false);
    expect(opts).toMatchObject({ playImmediately: true });
    expect(screen.getByRole('link', { name: 'Open Ext Track in Spotify' })).toBeInTheDocument();
  });

  test('canPlay=true: adding an album fetches its tracks and enqueues all of them in order', async () => {
    apiService.getSpotifyAlbumTracks.mockResolvedValue({ data: { configured: true, album: { id: 'al1', name: 'Some Album', imageUrl: null, artists: [] }, tracks: [
      { id: 'a', uri: 'spotify:track:a', name: 'One', artists: [], durationMs: 0 },
      { id: 'b', uri: 'spotify:track:b', name: 'Two', artists: [], durationMs: 1000 },
    ] } });
    render(<SpotifyResults canPlay albums={[album]} />);
    fireEvent.click(screen.getByRole('button', { name: 'Add Some Album to queue' }));
    await waitFor(() => expect(usePlayerStore.getState().addTracks).toHaveBeenCalled());
    const [entries, next, opts] = usePlayerStore.getState().addTracks.mock.calls[0];
    expect(apiService.getSpotifyAlbumTracks).toHaveBeenCalledWith('al1');
    expect(entries.map((e) => e.uri)).toEqual(['spotify:track:a', 'spotify:track:b']);
    expect(entries[0].album.title).toBe('Some Album');
    expect(next).toBe(false);
    expect(opts.playImmediately).toBeUndefined();
  });

  test.each([
    ['a 404', () => Promise.reject({ response: { status: 404 } })],
    ['configured:false', () => Promise.resolve({ data: { configured: false, album: null, tracks: [] } })],
  ])('album fetch failure (%s) enqueues nothing and does not throw', async (_n, impl) => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    apiService.getSpotifyAlbumTracks.mockImplementation(impl);
    render(<SpotifyResults canPlay albums={[album]} />);
    fireEvent.click(screen.getByRole('button', { name: 'Play Some Album' }));
    await waitFor(() => expect(warn).toHaveBeenCalled());
    expect(usePlayerStore.getState().addTracks).not.toHaveBeenCalled();
    warn.mockRestore();
  });
});

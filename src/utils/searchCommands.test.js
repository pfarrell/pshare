import { describe, test, expect, beforeEach, afterEach, vi } from 'vitest';
import { parseSearchCommand, runSearchCommand } from './searchCommands';
import { apiService } from '../services/api';
import { usePlayerStore } from '../stores/playerStore';

vi.mock('../services/api', () => ({
  apiService: {
    search: vi.fn(),
    getRandomScopeTracks: vi.fn(),
    getAlbum: vi.fn(),
    getPlaylist: vi.fn(),
  },
}));

describe('parseSearchCommand', () => {
  test.each([
    ['play artist radiohead', 'artist', 'radiohead'],
    ['play album ok computer', 'album', 'ok computer'],
    ['play collection road trip', 'collection', 'road trip'],
    ['play playlist morning mix', 'playlist', 'morning mix'],
  ])('recognizes %j', (input, type, query) => {
    expect(parseSearchCommand(input)).toEqual({ type, query });
  });

  test('ignores case, extra whitespace, and dictation punctuation', () => {
    expect(parseSearchCommand('  Play   Album   Abbey Road.  ')).toEqual({ type: 'album', query: 'Abbey Road' });
    expect(parseSearchCommand('Play artist, Radiohead!')).toEqual({ type: 'artist', query: 'Radiohead' });
  });

  test('keeps punctuation inside the name', () => {
    expect(parseSearchCommand('play artist AC/DC')).toEqual({ type: 'artist', query: 'AC/DC' });
  });

  test('accepts "play list" as dictated "playlist"', () => {
    expect(parseSearchCommand('Play play list Morning Mix')).toEqual({ type: 'playlist', query: 'Morning Mix' });
  });

  test.each([
    'radiohead',
    'play radiohead',
    'play artist',
    'play album   .',
    'artist radiohead',
    'replay artist radiohead',
    'play artists radiohead',
  ])('returns null for non-command %j', (input) => {
    expect(parseSearchCommand(input)).toBeNull();
  });
});

describe('runSearchCommand', () => {
  const tracks = [{ id: 1, title: 'One', url: '/1' }, { id: 2, title: 'Two', url: '/2' }];
  let original;
  let clearPlaylist;
  let addTracks;
  let setQueueSource;
  let navigate;

  const searchResponse = (results, extra = {}) => ({ data: { results, hasMore: false, resultCounts: {}, ...extra } });

  beforeEach(() => {
    vi.clearAllMocks();
    original = usePlayerStore.getState();
    clearPlaylist = vi.fn();
    addTracks = vi.fn();
    setQueueSource = vi.fn();
    usePlayerStore.setState({ clearPlaylist, addTracks, setQueueSource });
    navigate = vi.fn();
  });

  afterEach(() => {
    usePlayerStore.setState({
      clearPlaylist: original.clearPlaylist,
      addTracks: original.addTracks,
      setQueueSource: original.setQueueSource,
    });
  });

  test('artist: plays the top artist match, skipping other result types', async () => {
    apiService.search.mockResolvedValue(searchResponse([
      { type: 'album', data: { id: 9, title: 'Radiohead Live' } },
      { type: 'artist', data: { id: 3, name: 'Radiohead' } },
      { type: 'artist', data: { id: 4, name: 'Radiohead Tribute' } },
    ]));
    apiService.getRandomScopeTracks.mockResolvedValue({ data: { tracks } });

    const result = await runSearchCommand({ type: 'artist', query: 'radiohead' }, { profileId: 5, navigate });

    expect(apiService.search).toHaveBeenCalledWith('radiohead', undefined, 5);
    expect(apiService.getRandomScopeTracks).toHaveBeenCalledWith('artist', 3);
    expect(result).toEqual({ status: 'playing', type: 'artist', id: 3, name: 'Radiohead' });
  });

  test('replaces the queue, starts the first track, and tags the queue source', async () => {
    apiService.search.mockResolvedValue(searchResponse([{ type: 'collection', data: { id: 6, name: 'Road Trip' } }]));
    apiService.getRandomScopeTracks.mockResolvedValue({ data: { tracks } });

    await runSearchCommand({ type: 'collection', query: 'road trip' }, { navigate });

    expect(clearPlaylist).toHaveBeenCalled();
    expect(clearPlaylist.mock.invocationCallOrder[0]).toBeLessThan(addTracks.mock.invocationCallOrder[0]);
    expect(addTracks).toHaveBeenCalledWith(tracks, false, { flashActivity: true, playImmediately: true });
    expect(setQueueSource).toHaveBeenCalledWith({ type: 'collection', id: 6 });
  });

  test('navigates to the matched page', async () => {
    apiService.search.mockResolvedValue(searchResponse([{ type: 'collection', data: { id: 6, name: 'Road Trip' } }]));
    apiService.getRandomScopeTracks.mockResolvedValue({ data: { tracks } });

    await runSearchCommand({ type: 'collection', query: 'road trip' }, { navigate });

    expect(navigate).toHaveBeenCalledWith('/collection/6');
  });

  test('album: plays the album tracks in order', async () => {
    apiService.search.mockResolvedValue(searchResponse([
      { type: 'album', data: { id: 12, title: 'OK Computer', artist: { id: 3, name: 'Radiohead' } } },
    ]));
    apiService.getAlbum.mockResolvedValue({ data: { tracks } });

    await runSearchCommand({ type: 'album', query: 'ok computer' }, { navigate });

    expect(apiService.getAlbum).toHaveBeenCalledWith(12, { summary: false });
    expect(addTracks).toHaveBeenCalledWith(tracks, false, { flashActivity: true, playImmediately: true });
    expect(navigate).toHaveBeenCalledWith('/album/12');
  });

  test('playlist: plays tracks tagged with their source playlist, like the Playlist page', async () => {
    apiService.search.mockResolvedValue(searchResponse([{ type: 'playlist', data: { id: 8, name: 'Morning Mix' } }]));
    apiService.getPlaylist.mockResolvedValue({ data: { playlist: { id: 8, name: 'Morning Mix' }, tracks } });

    await runSearchCommand({ type: 'playlist', query: 'morning mix' }, { navigate });

    expect(apiService.getPlaylist).toHaveBeenCalledWith(8);
    expect(addTracks.mock.calls[0][0]).toEqual(tracks.map((t) => ({ ...t, source_playlist: { id: 8, name: 'Morning Mix' } })));
    expect(setQueueSource).toHaveBeenCalledWith({ type: 'playlist', id: 8 });
    expect(navigate).toHaveBeenCalledWith('/playlist/8');
  });

  test('looks past the first page when the type has matches further down', async () => {
    apiService.search
      .mockResolvedValueOnce(searchResponse([{ type: 'album', data: { id: 1, title: 'X' } }], { hasMore: true, resultCounts: { playlist: 1 }, pageSize: 1 }))
      .mockResolvedValueOnce(searchResponse([{ type: 'playlist', data: { id: 8, name: 'Morning Mix' } }]));
    apiService.getPlaylist.mockResolvedValue({ data: { playlist: { id: 8, name: 'Morning Mix' }, tracks } });

    await runSearchCommand({ type: 'playlist', query: 'morning' }, { navigate });

    expect(apiService.search).toHaveBeenNthCalledWith(2, 'morning', 1, null);
    expect(navigate).toHaveBeenCalledWith('/playlist/8');
  });

  test('no match: leaves the queue alone, stays put, and says so', async () => {
    apiService.search.mockResolvedValue(searchResponse([{ type: 'artist', data: { id: 3, name: 'Abba' } }]));

    const result = await runSearchCommand({ type: 'album', query: 'abbey road' }, { navigate });

    expect(result).toEqual({ status: 'not_found' });
    expect(clearPlaylist).not.toHaveBeenCalled();
    expect(addTracks).not.toHaveBeenCalled();
    expect(navigate).not.toHaveBeenCalled();
  });

  test('a match with no playable tracks is treated as no match', async () => {
    apiService.search.mockResolvedValue(searchResponse([{ type: 'artist', data: { id: 3, name: 'Empty' } }]));
    apiService.getRandomScopeTracks.mockResolvedValue({ data: { tracks: [] } });

    const result = await runSearchCommand({ type: 'artist', query: 'empty' }, { navigate });

    expect(result).toEqual({ status: 'not_found' });
    expect(clearPlaylist).not.toHaveBeenCalled();
    expect(navigate).not.toHaveBeenCalled();
  });

  test('a failed request is treated as no match', async () => {
    apiService.search.mockRejectedValue(new Error('network down'));
    vi.spyOn(console, 'error').mockImplementation(() => {});

    const result = await runSearchCommand({ type: 'artist', query: 'radiohead' }, { navigate });

    expect(result).toEqual({ status: 'not_found' });
    expect(clearPlaylist).not.toHaveBeenCalled();
  });
});

import { spotifyItemCount, visibleSpotifyResults } from './spotifyResults';

const data = {
  artists: [{ id: 'r', name: 'Radiohead', localId: 7 }, { id: 'n', name: 'New Artist', localId: null }],
  albums: [{ id: 'a', name: 'OK Computer', localId: 12 }, { id: 'b', name: 'Unowned Album', localId: null }],
  tracks: [{ id: 't', name: 'No localId field' }],
};

describe('visibleSpotifyResults', () => {
  test('hides items the library already has by default, list by list', () => {
    const out = visibleSpotifyResults(data);
    expect(out.artists.map((a) => a.id)).toEqual(['n']);
    expect(out.albums.map((a) => a.id)).toEqual(['b']);
    // A missing localId counts as not in the library.
    expect(out.tracks.map((t) => t.id)).toEqual(['t']);
  });

  test('a hidden artist does not hide that artist\'s unowned albums', () => {
    const out = visibleSpotifyResults({
      artists: [{ id: 'r', name: 'Radiohead', localId: 7 }],
      albums: [{ id: 'b', name: 'Unowned', artists: [{ id: 'r', name: 'Radiohead' }], localId: null }],
    });
    expect(out.artists).toEqual([]);
    expect(out.albums.map((a) => a.id)).toEqual(['b']);
  });

  test('includeLibraryMatches shows everything', () => {
    const out = visibleSpotifyResults(data, { includeLibraryMatches: true });
    expect(out.artists).toHaveLength(2);
    expect(out.albums).toHaveLength(2);
    expect(out.tracks).toHaveLength(1);
  });

  test('always returns arrays of objects for missing or malformed input', () => {
    expect(visibleSpotifyResults(null)).toEqual({ tracks: [], albums: [], artists: [] });
    expect(visibleSpotifyResults({ tracks: 'nope', albums: [null, 3, { id: 'x' }], artists: {} })).toEqual({
      tracks: [],
      albums: [{ id: 'x' }],
      artists: [],
    });
  });
});

describe('spotifyItemCount', () => {
  test('counts every item including library matches', () => {
    expect(spotifyItemCount(data)).toBe(5);
  });

  test('is 0 for missing or malformed input', () => {
    expect(spotifyItemCount(null)).toBe(0);
    expect(spotifyItemCount({ tracks: 'x', albums: [null] })).toBe(0);
  });
});

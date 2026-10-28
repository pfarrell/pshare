import { describe, test, expect } from 'vitest';
import { mergeRankedResults, mergeTracks, spotifyScore } from './mergeSearchResults';

const lib = (type, id, score) => ({ type, data: { id }, score });
const sp = (id, score) => ({ id, name: id, score });

// Compact view of a merged list: "lib:album:1" / "sp:artist:x".
const keys = (merged) => merged.map((e) => `${e.source === 'library' ? 'lib' : 'sp'}:${e.type}:${e.data.id}`);

describe('mergeRankedResults', () => {
  test('a Spotify artist at 0.5 lands between library items at 0.6 and 0.4', () => {
    const merged = mergeRankedResults([lib('album', 1, 0.6), lib('album', 2, 0.4)], [sp('x', 0.5)], [], { hasMore: false });
    expect(keys(merged)).toEqual(['lib:album:1', 'sp:artist:x', 'lib:album:2']);
  });

  test('ties go to library: a Spotify 2.0 album follows every library 2.0 item', () => {
    const merged = mergeRankedResults(
      [lib('artist', 1, 2), lib('album', 2, 2), lib('playlist', 3, 0.3)],
      [], [sp('y', 2)], { hasMore: false },
    );
    expect(keys(merged)).toEqual(['lib:artist:1', 'lib:album:2', 'sp:album:y', 'lib:playlist:3']);
  });

  test('equal-score Spotify items order albums before artists, then by Spotify order', () => {
    const merged = mergeRankedResults([], [sp('a1', 2), sp('a2', 2)], [sp('b1', 2), sp('b2', 2)], { hasMore: false });
    expect(keys(merged)).toEqual(['sp:album:b1', 'sp:album:b2', 'sp:artist:a1', 'sp:artist:a2']);
  });

  test('Spotify items sort by score before type', () => {
    const merged = mergeRankedResults([], [sp('hi', 0.9)], [sp('lo', 0.3)], { hasMore: false });
    expect(keys(merged)).toEqual(['sp:artist:hi', 'sp:album:lo']);
  });

  test('while hasMore, a Spotify item scoring at or below the last loaded library score is withheld', () => {
    const merged = mergeRankedResults(
      [lib('album', 1, 0.8), lib('album', 2, 0.5)],
      [sp('above', 0.6), sp('tie', 0.5), sp('below', 0.3)], [], { hasMore: true },
    );
    expect(keys(merged)).toEqual(['lib:album:1', 'sp:artist:above', 'lib:album:2']);
  });

  test('all-ties query with hasMore: no Spotify item is visible', () => {
    const merged = mergeRankedResults([lib('artist', 1, 2), lib('album', 2, 2)], [sp('x', 2)], [sp('y', 2)], { hasMore: true });
    expect(keys(merged)).toEqual(['lib:artist:1', 'lib:album:2']);
  });

  test('null-score items appear only when hasMore is false, after everything', () => {
    const library = [lib('album', 1, 2), lib('album', 2, 0.3)];
    const artists = [sp('unmatched-artist', null)];
    const albums = [sp('unmatched-album', null), sp('matched', 2)];

    expect(keys(mergeRankedResults(library, artists, albums, { hasMore: true })))
      .toEqual(['lib:album:1', 'sp:album:matched', 'lib:album:2']);
    expect(keys(mergeRankedResults(library, artists, albums, { hasMore: false })))
      .toEqual(['lib:album:1', 'sp:album:matched', 'lib:album:2', 'sp:album:unmatched-album', 'sp:artist:unmatched-artist']);
  });

  test('items with missing or non-numeric score are treated as null and never throw', () => {
    const artists = [{ id: 'none', name: 'none' }, { id: 'str', name: 'str', score: '2' }, { id: 'nan', score: NaN }];
    const merged = mergeRankedResults([lib('album', 1, 0.5)], artists, [null, 'junk'], { hasMore: false });
    expect(keys(merged)).toEqual(['lib:album:1', 'sp:artist:none', 'sp:artist:str', 'sp:artist:nan']);
  });

  test('library results without a score (older backend) all stay ahead of Spotify items', () => {
    const merged = mergeRankedResults([{ type: 'album', data: { id: 1 } }], [sp('x', 2)], [], { hasMore: false });
    expect(keys(merged)).toEqual(['lib:album:1', 'sp:artist:x']);
  });

  test('later pages: merging page1+page2 keeps every page1 item\'s position', () => {
    const page1 = [lib('album', 1, 2), lib('album', 2, 0.9), lib('album', 3, 0.7)];
    const page2 = [lib('album', 4, 0.6), lib('album', 5, 0.4)];
    const artists = [sp('x', 0.8), sp('y', 0.5)];

    const first = keys(mergeRankedResults(page1, artists, [], { hasMore: true }));
    const second = keys(mergeRankedResults([...page1, ...page2], artists, [], { hasMore: true }));

    expect(first).toEqual(['lib:album:1', 'lib:album:2', 'sp:artist:x', 'lib:album:3']);
    expect(second.slice(0, first.length)).toEqual(first);
    expect(second).toEqual([...first, 'lib:album:4', 'sp:artist:y', 'lib:album:5']);
  });

  test('entries carry source, type, the original data and the score', () => {
    const artist = sp('x', 0.5);
    const [libEntry, spEntry] = mergeRankedResults([lib('collection', 7, 0.9)], [artist], [], { hasMore: false });
    expect(libEntry).toEqual({ source: 'library', type: 'collection', data: { id: 7 }, score: 0.9 });
    expect(spEntry).toEqual({ source: 'spotify', type: 'artist', data: artist, score: 0.5 });
  });
});

describe('mergeTracks', () => {
  test('library first, then Spotify name matches, then the rest', () => {
    const merged = mergeTracks(
      [{ id: 1 }, { id: 2 }],
      [{ id: 'other', score: null }, { id: 'match', score: 2 }, { id: 'unscored' }],
    );
    expect(merged.map((e) => `${e.source}:${e.data.id}`)).toEqual([
      'library:1', 'library:2', 'spotify:match', 'spotify:other', 'spotify:unscored',
    ]);
  });

  test('tolerates missing lists and non-object entries', () => {
    expect(mergeTracks(undefined, [null, { id: 'a', score: 2 }])).toEqual([{ source: 'spotify', data: { id: 'a', score: 2 } }]);
  });
});

describe('spotifyScore', () => {
  test('returns finite numeric scores and null for anything else', () => {
    expect(spotifyScore({ score: 0.5 })).toBe(0.5);
    expect(spotifyScore({ score: 2 })).toBe(2);
    expect(spotifyScore({ score: null })).toBeNull();
    expect(spotifyScore({ score: '2' })).toBeNull();
    expect(spotifyScore({ score: Infinity })).toBeNull();
    expect(spotifyScore({})).toBeNull();
    expect(spotifyScore(null)).toBeNull();
  });
});

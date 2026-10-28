import { describe, test, expect } from 'vitest';
import { mergeAlbumFill } from './mergeAlbumFill';

const spotifyAlbum = { id: 'gh', name: 'Greatest Hits', imageUrl: 'https://i/gh' };
const fillTrack = (position) => ({
  position, uri: `spotify:track:t${position}`, id: `t${position}`, name: `Song ${position}`,
  artists: [{ id: 'jg', name: 'James Gang' }], album: { id: 'gh', name: 'Greatest Hits', imageUrl: null }, durationMs: 1000,
});
const keys = (list) => list.map((t) => (t.source === 'spotify' ? `sp${t.title.split(' ')[1]}` : `lib${t.id}`));

describe('mergeAlbumFill', () => {
  test('interleaves by position', () => {
    const merged = mergeAlbumFill([{ id: 1, title: 'the bomber' }], {
      spotifyAlbum, tracks: [fillTrack(1), fillTrack(2), fillTrack(11)], libraryPositions: { 1: 10 },
    });
    expect(keys(merged)).toEqual(['sp1', 'sp2', 'lib1', 'sp11']);
    expect(merged[0]).toMatchObject({ source: 'spotify', uri: 'spotify:track:t1', album: { title: 'Greatest Hits', spotifyId: 'gh' } });
  });

  test('returns the same array when there is no fill', () => {
    const library = [{ id: 1 }];
    expect(mergeAlbumFill(library, { spotifyAlbum: null, tracks: [], libraryPositions: {} })).toBe(library);
    expect(mergeAlbumFill(library, undefined)).toBe(library);
  });

  test('a fill item without a uri is skipped', () => {
    const merged = mergeAlbumFill([{ id: 1 }], {
      spotifyAlbum, tracks: [{ ...fillTrack(1), uri: '' }, fillTrack(2)], libraryPositions: { 1: 5 },
    });
    expect(keys(merged)).toEqual(['sp2', 'lib1']);
  });

  test('library tracks without a known position keep their order', () => {
    const merged = mergeAlbumFill([{ id: 1 }, { id: 2 }, { id: 3 }], {
      spotifyAlbum, tracks: [fillTrack(1), fillTrack(6)], libraryPositions: { 1: 4, 3: 8 },
    });
    expect(keys(merged)).toEqual(['sp1', 'lib1', 'lib2', 'sp6', 'lib3']);
  });

  test('a custom entry builder shapes the Spotify entries and can skip some', () => {
    const merged = mergeAlbumFill([{ id: 1 }], {
      spotifyAlbum, tracks: [fillTrack(1), fillTrack(2)], libraryPositions: { 1: 5 },
    }, (item) => (item.position === 2 ? null : { raw: item.uri }));
    expect(merged).toEqual([{ raw: 'spotify:track:t1' }, { id: 1 }]);
  });

  test('tolerates a missing library list and non-object fill items', () => {
    expect(keys(mergeAlbumFill(undefined, { spotifyAlbum, tracks: [null, 'x', fillTrack(1)], libraryPositions: {} }))).toEqual(['sp1']);
  });
});

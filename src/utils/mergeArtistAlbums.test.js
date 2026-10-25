import { describe, test, expect } from 'vitest';
import { mergeArtistAlbums } from './mergeArtistAlbums';

const local = (id, title, release_year) => ({ id, title, release_year });
const sp = (id, name, releaseYear) => ({ id, name, releaseYear });
const ids = (merged) => merged.map((m) => `${m.kind}:${m.album.id}`);

describe('mergeArtistAlbums', () => {
  test('interleaves by year newest first; no-year local and Spotify albums last', () => {
    const merged = mergeArtistAlbums(
      [local(1, 'Fearless', '2008'), local(2, 'Undated Local', null)],
      [sp('a', 'Lover', '2019'), sp('b', 'Red', '2012'), sp('c', 'Undated Spotify', null)],
    );
    expect(ids(merged)).toEqual(['spotify:a', 'spotify:b', 'local:1', 'local:2', 'spotify:c']);
  });

  test('ties go to local first, then title ascending', () => {
    const merged = mergeArtistAlbums(
      [local(1, 'Zed', '2010')],
      [sp('b', 'Beta', '2010'), sp('a', 'Alpha', '2010')],
    );
    expect(ids(merged)).toEqual(['local:1', 'spotify:a', 'spotify:b']);
  });

  test('local relative order is preserved even when it disagrees with year order', () => {
    const merged = mergeArtistAlbums([local(1, 'B', '2001'), local(2, 'A', '2005')], []);
    expect(ids(merged)).toEqual(['local:1', 'local:2']);
  });

  test("a '0' local year and a null Spotify releaseYear both go to the no-year group", () => {
    const merged = mergeArtistAlbums([local(1, 'Zero', '0')], [sp('a', 'Dated', '1999'), sp('b', 'Nope', null)]);
    expect(ids(merged)).toEqual(['spotify:a', 'local:1', 'spotify:b']);
  });

  test('tolerates missing arrays', () => {
    expect(mergeArtistAlbums(undefined, null)).toEqual([]);
  });
});

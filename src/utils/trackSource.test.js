import { describe, it, expect } from 'vitest';
import { isSpotifyTrack, trackKey, toSpotifyQueueTrack, localTrackIds } from './trackSource';

const item = {
  uri: 'spotify:track:abc', id: 'abc', name: 'Song',
  artists: [{ id: 'a1', name: 'One' }, { id: 'a2', name: 'Two' }],
  album: { id: 'al', name: 'Album', imageUrl: 'http://img/a.jpg' },
  durationMs: 215500, explicit: false, externalUrl: 'http://x', localId: null,
};

describe('toSpotifyQueueTrack', () => {
  it('maps all fields and carries no id/url/artist.id/album.id', () => {
    const t = toSpotifyQueueTrack(item);
    expect(t).toEqual({
      source: 'spotify', uri: 'spotify:track:abc', spotifyId: 'abc', title: 'Song',
      artist: { name: 'One, Two' }, album: { title: 'Album', spotifyId: 'al' },
      imageUrl: 'http://img/a.jpg', duration: 215.5,
    });
    expect(t).not.toHaveProperty('id');
    expect(t).not.toHaveProperty('url');
  });
  it('returns null without uri', () => {
    expect(toSpotifyQueueTrack({ ...item, uri: '' })).toBeNull();
    expect(toSpotifyQueueTrack(null)).toBeNull();
  });
  it('tolerates null artists, album and duration', () => {
    const t = toSpotifyQueueTrack({ uri: 'u', id: 'i', name: 'N', artists: null, album: null, durationMs: null });
    expect(t.artist).toEqual({ name: '' });
    expect(t.album).toEqual({ title: '', spotifyId: null });
    expect(t.imageUrl).toBeNull();
    expect(t.duration).toBe(0);
  });
  it('falls back to the album argument for name and artwork', () => {
    const t = toSpotifyQueueTrack({ ...item, album: null }, { name: 'Parent', imageUrl: 'http://p.jpg', id: 'p' });
    expect(t.album.title).toBe('Parent');
    expect(t.album.spotifyId).toBe('p');
    expect(t.imageUrl).toBe('http://p.jpg');
  });
});

describe('trackKey / isSpotifyTrack', () => {
  it('covers local, spotify and fallback', () => {
    expect(trackKey({ id: 42 }, 3)).toBe('42');
    expect(trackKey({ source: 'spotify', uri: 'spotify:track:x' }, 3)).toBe('spotify:track:x');
    expect(trackKey({ title: 'x' }, 3)).toBe('idx-3');
    expect(isSpotifyTrack({ source: 'spotify' })).toBe(true);
    expect(isSpotifyTrack({ id: 1 })).toBe(false);
    expect(isSpotifyTrack(null)).toBe(false);
  });
});

describe('localTrackIds', () => {
  it('keeps only numeric ids', () => {
    expect(localTrackIds([{ id: 1 }, { source: 'spotify', uri: 'u' }, { id: 7 }, null])).toEqual([1, 7]);
  });
});

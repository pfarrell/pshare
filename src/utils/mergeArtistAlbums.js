// src/utils/mergeArtistAlbums.js
import { getAlbumYear } from './formatters';

// Merges the artist's Spotify albums (#72) into the local album list using the
// artist page's own order (server/src/routes/artists.ts): dated albums first,
// newest year first, then title; undated last. Local albums keep their server
// order relative to each other, and win ties against Spotify ones.
const yearOf = (entry) => (entry.kind === 'local'
  ? getAlbumYear(entry.album?.release_year)
  : (typeof entry.album?.releaseYear === 'string' && entry.album.releaseYear) || null);
const titleOf = (entry) => String((entry.kind === 'local' ? entry.album?.title : entry.album?.name) ?? '');

// Spotify-vs-local: does `a` (spotify) belong before `b` (local)?
const before = (a, b) => {
  const ya = yearOf(a);
  const yb = yearOf(b);
  if (!!ya !== !!yb) return !!ya;
  if (ya && yb && ya !== yb) return ya > yb;
  return false; // tie on year (or both undated): local first
};

export const mergeArtistAlbums = (localAlbums, spotifyAlbums) => {
  const locals = (Array.isArray(localAlbums) ? localAlbums : []).filter(Boolean).map((album) => ({ kind: 'local', album }));
  const spotify = (Array.isArray(spotifyAlbums) ? spotifyAlbums : []).filter(Boolean).map((album) => ({ kind: 'spotify', album }))
    .sort((a, b) => {
      const ya = yearOf(a); const yb = yearOf(b);
      if (!!ya !== !!yb) return ya ? -1 : 1;
      if (ya && yb && ya !== yb) return ya > yb ? -1 : 1;
      return titleOf(a).localeCompare(titleOf(b));
    });
  const merged = [];
  let s = 0;
  for (const local of locals) {
    while (s < spotify.length && before(spotify[s], local)) merged.push(spotify[s++]);
    merged.push(local);
  }
  return merged.concat(spotify.slice(s));
};

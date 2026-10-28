// src/utils/mergeAlbumFill.js
// Interleaves a library album's tracks with the Spotify tracks that fill its
// gaps (#72, experimental; see server/src/services/spotifyAlbumFill.ts), by
// position on the matched release. Library tracks come first on a tie, and a
// library track with no known position sorts with the one before it.
import { toSpotifyQueueTrack } from './trackSource';

const isObject = (v) => v && typeof v === 'object';

/**
 * @param {Array} libraryTracks - the album's library tracks, in today's order
 * @param {{ spotifyAlbum, tracks, libraryPositions }} fill - from useSpotifyAlbumFill
 * @returns {Array} library tracks (unchanged objects) and Spotify queue entries;
 *   libraryTracks itself when there is nothing to fill
 */
export function mergeAlbumFill(libraryTracks, fill) {
  const library = Array.isArray(libraryTracks) ? libraryTracks : [];
  const fills = (Array.isArray(fill?.tracks) ? fill.tracks : [])
    .filter((t) => isObject(t) && Number.isInteger(t.position))
    .map((t) => ({ position: t.position, entry: toSpotifyQueueTrack(t, fill.spotifyAlbum) }))
    .filter((f) => f.entry);
  if (fills.length === 0) return libraryTracks;

  const positions = isObject(fill.libraryPositions) ? fill.libraryPositions : {};
  let previous = 0;
  const placed = library.map((track, index) => {
    const known = positions[track?.id];
    if (Number.isInteger(known)) previous = known;
    return { position: previous, kind: 0, index, value: track };
  });
  fills.forEach((f, index) => placed.push({ position: f.position, kind: 1, index, value: f.entry }));

  return placed
    .sort((a, b) => a.position - b.position || a.kind - b.kind || a.index - b.index)
    .map((p) => p.value);
}

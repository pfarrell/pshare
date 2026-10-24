// src/utils/spotifyResults.js
// Shapes the /search/spotify body for the "From Spotify" section (#72,
// experimental). The backend annotates every item with `localId` — the id of
// the matching row anywhere in the library, or null — so "fill in the
// blanks" is just hiding non-null localIds here; no client-side matching.

// Arrays only, and only object entries — anything else from a malformed
// response is dropped here so render code can assume `item` is an object.
const objects = (value) => (Array.isArray(value) ? value.filter((v) => v && typeof v === 'object') : []);

// A missing localId (e.g. a backend deployed before library matching) counts
// as "not in the library", so the item still shows.
const notInLibrary = (item) => item.localId === null || item.localId === undefined;

/** Total number of Spotify items in the response, library matches included. */
export function spotifyItemCount(data) {
  return objects(data?.tracks).length + objects(data?.albums).length + objects(data?.artists).length;
}

/**
 * @param {{ tracks?, albums?, artists? }} data - /search/spotify response body
 * @param {{ includeLibraryMatches?: boolean }} options - true shows items the
 *   library already has (the "Spotify" pill); false (default) hides them
 * @returns {{ tracks, albums, artists }} always arrays of objects, even if
 *   the input was missing/malformed. Each list is filtered independently: a
 *   hidden (owned) artist never hides that artist's unowned albums/tracks.
 */
export function visibleSpotifyResults(data, { includeLibraryMatches = false } = {}) {
  const keep = (list) => (includeLibraryMatches ? objects(list) : objects(list).filter(notInLibrary));
  return {
    tracks: keep(data?.tracks),
    albums: keep(data?.albums),
    artists: keep(data?.artists),
  };
}

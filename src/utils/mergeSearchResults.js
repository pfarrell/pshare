// src/utils/mergeSearchResults.js
// Mixes Spotify search items into the Search page's library results (#72,
// experimental). Both sides carry the same kind of score (the backend
// computes Spotify's with library search's own SQL, see
// server/src/services/spotifySearchScore.ts): 2 for a name containing the
// query, a trigram similarity for a near miss, or null for a Spotify item
// that matched on something else (usually its artist).
//
// Rules: score descending; on a tie library comes first; equal-score Spotify
// items go albums before artists (library search's model_type tie-break),
// then in Spotify's order. Library order is never changed. Because library
// results load a page at a time, a Spotify item only shows once the loaded
// library results have reached its score — otherwise it would have to jump
// ahead of rows a later page brings in. Null-score items wait for the last
// page and go at the very end.

const TYPE_ORDER = { album: 0, artist: 1 };

const objects = (value) => (Array.isArray(value) ? value.filter((v) => v && typeof v === 'object') : []);

/** A Spotify item's score, or null unless it's a finite number. */
export function spotifyScore(item) {
  const score = item?.score;
  return typeof score === 'number' && Number.isFinite(score) ? score : null;
}

// A library result from a backend that predates scores sorts ahead of every
// Spotify item, which keeps the library's own order intact.
const libraryScore = (result) => (typeof result.score === 'number' && Number.isFinite(result.score) ? result.score : Infinity);

const bySpotifyRank = (a, b) => {
  if (a.score !== b.score) {
    if (a.score === null) return 1;
    if (b.score === null) return -1;
    return b.score - a.score;
  }
  return TYPE_ORDER[a.type] - TYPE_ORDER[b.type] || a.index - b.index;
};

/**
 * @param {Array<{ type, data, score }>} libraryResults - loaded library ranked results, in order
 * @param {Array} spotifyArtists - Spotify artists to show (owned ones already filtered out)
 * @param {Array} spotifyAlbums - Spotify albums to show (owned ones already filtered out)
 * @param {{ hasMore: boolean }} options - whether more library pages remain
 * @returns {Array<{ source: 'library'|'spotify', type, data, score }>}
 */
export function mergeRankedResults(libraryResults, spotifyArtists, spotifyAlbums, { hasMore }) {
  const spotify = [
    ...objects(spotifyArtists).map((data, index) => ({ source: 'spotify', type: 'artist', data, score: spotifyScore(data), index })),
    ...objects(spotifyAlbums).map((data, index) => ({ source: 'spotify', type: 'album', data, score: spotifyScore(data), index })),
  ].sort(bySpotifyRank);

  const merged = [];
  let next = 0;
  const pushSpotify = (entry) => {
    const { index, ...rest } = entry; // eslint-disable-line no-unused-vars
    merged.push(rest);
    next += 1;
  };

  for (const result of objects(libraryResults)) {
    const score = libraryScore(result);
    while (next < spotify.length && spotify[next].score !== null && spotify[next].score > score) pushSpotify(spotify[next]);
    merged.push({ source: 'library', type: result.type, data: result.data, score: result.score });
  }

  if (!hasMore) while (next < spotify.length) pushSpotify(spotify[next]);
  return merged;
}

/**
 * Library tracks first (library track search only matches on a contained
 * title, so they're all name matches), then Spotify name matches, then the
 * rest — each group in its own order.
 * @returns {Array<{ source: 'library'|'spotify', data }>}
 */
export function mergeTracks(libraryTracks, spotifyTracks) {
  const spotify = objects(spotifyTracks);
  return [
    ...objects(libraryTracks).map((data) => ({ source: 'library', data })),
    ...spotify.filter((t) => spotifyScore(t) !== null).map((data) => ({ source: 'spotify', data })),
    ...spotify.filter((t) => spotifyScore(t) === null).map((data) => ({ source: 'spotify', data })),
  ];
}

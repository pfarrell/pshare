// Queue entries are either local library tracks (numeric id + stream url) or Spotify
// entries (uri only: no numeric id, no url, no artist.id / album.id; the Spotify
// album id is album.spotifyId, for the Spotify play log).
export const isSpotifyTrack = (track) => track?.source === 'spotify';

// Stable React key / identity for a queue entry.
export const trackKey = (track, index) => {
  if (isSpotifyTrack(track) && track.uri) return track.uri;
  if (track?.id != null) return String(track.id);
  return `idx-${index}`;
};

// Maps a /search/spotify track item (optionally with its parent album as fallback
// artwork/name) to a player queue entry. Null when there is nothing playable.
export const toSpotifyQueueTrack = (item, album) => {
  if (!item?.uri) return null;
  const artists = Array.isArray(item.artists) ? item.artists : [];
  const artistName = artists.map((a) => a?.name).filter(Boolean).join(', ');
  const durationMs = Number(item.durationMs);
  return {
    source: 'spotify',
    uri: item.uri,
    spotifyId: item.id,
    title: item.name ?? '',
    artist: { name: artistName },
    album: { title: item.album?.name ?? album?.name ?? '', spotifyId: item.album?.id || album?.id || null },
    imageUrl: item.album?.imageUrl ?? album?.imageUrl ?? null,
    duration: Number.isFinite(durationMs) ? durationMs / 1000 : 0,
  };
};

// Numeric library ids of the local tracks in a queue (Spotify entries have none).
export const localTrackIds = (tracks) =>
  (tracks ?? []).map((t) => t?.id).filter((id) => Number.isInteger(id));

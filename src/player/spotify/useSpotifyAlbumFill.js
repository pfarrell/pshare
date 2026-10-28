// src/player/spotify/useSpotifyAlbumFill.js
import { useEffect, useState } from 'react';
import { apiService } from '../../services/api';
import { useCanPlaySpotify } from './useCanPlaySpotify';

const EMPTY = Object.freeze({ spotifyAlbum: null, tracks: [], libraryPositions: {} });

const isObject = (v) => v && typeof v === 'object';

function readFill(data) {
  if (!data?.configured || !isObject(data.spotifyAlbum)) return EMPTY;
  const tracks = (Array.isArray(data.tracks) ? data.tracks : []).filter((t) => isObject(t) && Number.isInteger(t.position));
  const libraryPositions = Object.fromEntries(
    Object.entries(isObject(data.libraryPositions) ? data.libraryPositions : {}).filter(([, p]) => Number.isInteger(p)),
  );
  return tracks.length > 0 ? { spotifyAlbum: data.spotifyAlbum, tracks, libraryPositions } : EMPTY;
}

// The Spotify tracks that fill a library album's missing positions (#72), for
// sessions that can play Spotify: { spotifyAlbum, tracks: [{ position, ... }],
// libraryPositions }. EMPTY while loading, when ineligible or disabled, when
// nothing confidently matches, and on any failure; a response for a previous
// album is dropped. A new refreshKey (e.g. the library track count) refetches,
// keeping the previous fill on screen until the new one arrives.
export const useSpotifyAlbumFill = (albumId, { enabled = true, refreshKey = null } = {}) => {
  const canPlay = useCanPlaySpotify();
  const active = canPlay && enabled && albumId != null;
  const [result, setResult] = useState({ albumId: null, fill: EMPTY });

  useEffect(() => {
    if (!active) return undefined;
    let cancelled = false;
    Promise.resolve()
      .then(() => apiService.getSpotifyAlbumFill(albumId))
      .then((res) => {
        if (!cancelled) setResult({ albumId, fill: readFill(res?.data) });
      })
      .catch((err) => {
        if (!cancelled) console.warn('Spotify album fill unavailable:', albumId, err);
      });
    return () => { cancelled = true; };
  }, [active, albumId, refreshKey]);

  return active && result.albumId === albumId ? result.fill : EMPTY;
};

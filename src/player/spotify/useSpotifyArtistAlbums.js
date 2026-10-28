// src/player/spotify/useSpotifyArtistAlbums.js
import { useEffect, useState } from 'react';
import { apiService } from '../../services/api';
import { useCanPlaySpotify } from './useCanPlaySpotify';

const EMPTY = Object.freeze({ albums: [], hasOwnReleases: null, guestTracks: [] });

const objects = (value) => (Array.isArray(value) ? value.filter((v) => v && typeof v === 'object') : []);

// What Spotify has for a library artist (#72), for sessions that can play
// Spotify: the albums the library doesn't own, whether Spotify lists anything
// of the artist's own (false = not on Spotify, null = unknown), and, when it
// doesn't, the tracks they guest on. EMPTY while loading, when ineligible, and
// on any failure; a response for a previous artist is dropped.
export const useSpotifyArtistCatalog = (localArtistId) => {
  const canPlay = useCanPlaySpotify();
  const [result, setResult] = useState({ artistId: null, catalog: EMPTY });

  useEffect(() => {
    if (!canPlay || localArtistId == null) return undefined;
    let cancelled = false;
    Promise.resolve()
      .then(() => apiService.getSpotifyArtistAlbums(localArtistId))
      .then((res) => {
        if (cancelled) return;
        const data = res?.data;
        const catalog = data?.configured
          ? {
            albums: Array.isArray(data.albums) ? data.albums : [],
            hasOwnReleases: typeof data.hasOwnReleases === 'boolean' ? data.hasOwnReleases : null,
            guestTracks: objects(data.guestTracks),
          }
          : EMPTY;
        setResult({ artistId: localArtistId, catalog });
      })
      .catch((err) => {
        if (!cancelled) console.warn('Spotify artist albums unavailable:', localArtistId, err);
      });
    return () => { cancelled = true; };
  }, [canPlay, localArtistId]);

  return canPlay && result.artistId === localArtistId ? result.catalog : EMPTY;
};

// Just the albums: [] while loading, when ineligible, and on any failure.
export const useSpotifyArtistAlbums = (localArtistId) => useSpotifyArtistCatalog(localArtistId).albums;

// src/player/spotify/useSpotifyArtistAlbums.js
import { useEffect, useState } from 'react';
import { apiService } from '../../services/api';
import { useCanPlaySpotify } from './useCanPlaySpotify';

// The artist's Spotify albums the library doesn't own (#72), for sessions that
// can play Spotify. [] while loading, when ineligible, and on any failure;
// a response for a previous artist is dropped.
export const useSpotifyArtistAlbums = (localArtistId) => {
  const canPlay = useCanPlaySpotify();
  const [result, setResult] = useState({ artistId: null, albums: [] });

  useEffect(() => {
    if (!canPlay || localArtistId == null) return undefined;
    let cancelled = false;
    Promise.resolve()
      .then(() => apiService.getSpotifyArtistAlbums(localArtistId))
      .then((res) => {
        if (cancelled) return;
        const albums = res?.data?.configured && Array.isArray(res.data.albums) ? res.data.albums : [];
        setResult({ artistId: localArtistId, albums });
      })
      .catch((err) => {
        if (!cancelled) console.warn('Spotify artist albums unavailable:', localArtistId, err);
      });
    return () => { cancelled = true; };
  }, [canPlay, localArtistId]);

  return canPlay && result.artistId === localArtistId ? result.albums : [];
};

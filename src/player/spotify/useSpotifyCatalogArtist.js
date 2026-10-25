// src/player/spotify/useSpotifyCatalogArtist.js
import { useEffect, useState } from 'react';
import { apiService } from '../../services/api';
import { useSpotifyPlayability } from './useCanPlaySpotify';

const SPOTIFY_ID = /^[A-Za-z0-9]{1,64}$/;

// A Spotify artist and their albums (#72) for the in-app Spotify artist views
// (browser page and kiosk drill-down). Albums the library owns carry localId.
//   { status: 'loading' }                      — playability or the fetch pending
//   { status: 'ready', artist, albums }
//   { status: 'unavailable' }                  — can't play Spotify, bad id, or any failure
// A response for a previous id is dropped.
export const useSpotifyCatalogArtist = (spotifyId) => {
  const playability = useSpotifyPlayability();
  const canPlay = playability === 'ready';
  const validId = SPOTIFY_ID.test(spotifyId ?? '');
  const [state, setState] = useState({ id: null, status: 'loading' });

  useEffect(() => {
    if (!validId || !canPlay) return undefined;
    let cancelled = false;
    Promise.resolve()
      .then(() => apiService.getSpotifyCatalogArtistAlbums(spotifyId))
      .then((res) => {
        if (cancelled) return;
        const data = res?.data;
        const ok = data?.configured && data.spotifyArtist && Array.isArray(data.albums);
        setState(ok
          ? { id: spotifyId, status: 'ready', artist: data.spotifyArtist, albums: data.albums.filter((a) => a && a.id) }
          : { id: spotifyId, status: 'unavailable' });
      })
      .catch((err) => {
        if (cancelled) return;
        console.warn('Spotify artist unavailable:', spotifyId, err);
        setState({ id: spotifyId, status: 'unavailable' });
      });
    return () => { cancelled = true; };
  }, [spotifyId, validId, canPlay]);

  if (!validId || playability === 'unavailable') return { status: 'unavailable' };
  if (!canPlay || state.id !== spotifyId) return { status: 'loading' };
  return state;
};

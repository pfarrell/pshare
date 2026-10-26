// src/jukebox/guest/guestSpotify.js
import { apiService } from '../../services/api';

// Shared helpers for the guest Spotify views (#72). Spotify items come from
// /jukebox/:token/spotify/* in the /search/spotify shape.
export const artistNames = (artists) => (Array.isArray(artists) ? artists : [])
  .map((a) => (typeof a?.name === 'string' ? a.name : '')).filter(Boolean).join(', ');

export const text = (v) => (typeof v === 'string' ? v : '');

// GuestAddButton spotifyTracks source for a whole Spotify album.
export const spotifyAlbumTracks = (token, albumId) => () =>
  apiService.guestSpotifyAlbum(token, albumId).then((res) => (Array.isArray(res.data?.tracks) ? res.data.tracks : []));

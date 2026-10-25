// src/player/spotify/useSpotifyPlayLog.js
import { useEffect } from 'react';
import { usePlayerStore } from '../../stores/playerStore';
import { apiService } from '../../services/api';
import { isSpotifyTrack } from '../../utils/trackSource';

// Same mark as usePlayerEngine's local apiService.log(id).
export const SPOTIFY_LOG_SECONDS = 5;

// POST /spotify/plays body for a Spotify queue entry.
export const spotifyPlayFrom = (track) => ({
  trackUri: track.uri,
  trackName: track.title ?? '',
  artistName: track.artist?.name ?? '',
  albumSpotifyId: track.album?.spotifyId ?? null,
  albumName: track.album?.title ?? '',
  albumImageUrl: track.imageUrl ?? null,
});

// Logs each Spotify track once it has played SPOTIFY_LOG_SECONDS (#72), so
// Spotify albums reach Jukebox Mode's Recent drawer. Once per queue entry per
// play: a different current track re-arms it. Failures are ignored, like
// local logging.
export const useSpotifyPlayLog = () => {
  useEffect(() => {
    let logged = null;
    return usePlayerStore.subscribe((state, prev) => {
      if (state.currentTrack !== prev.currentTrack) logged = null;
      const track = state.currentTrack;
      if (state.activeSource !== 'spotify' || !isSpotifyTrack(track) || !track.uri) return;
      if (logged === track || state.currentTime < SPOTIFY_LOG_SECONDS) return;
      logged = track;
      Promise.resolve()
        .then(() => apiService.logSpotifyPlay(spotifyPlayFrom(track)))
        .catch(() => {});
    });
  }, []);
};

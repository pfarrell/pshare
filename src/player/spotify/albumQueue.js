// src/player/spotify/albumQueue.js
import { apiService } from '../../services/api';
import { toSpotifyQueueTrack } from '../../utils/trackSource';

// Queue source for a whole Spotify album (for useQueueActions): fetches the full
// track list (the endpoint pages past 50 tracks) as queue entries. Every failure
// or odd shape yields [] so nothing is enqueued.
export const albumQueueTracks = (album) => async () => {
  try {
    const response = await apiService.getSpotifyAlbumTracks(album.id);
    const data = response?.data;
    if (!data?.configured || !Array.isArray(data.tracks)) {
      console.warn('Spotify album tracks unavailable:', album.id);
      return [];
    }
    const parent = data.album ?? album;
    return data.tracks.map((t) => toSpotifyQueueTrack(t, parent)).filter(Boolean);
  } catch (err) {
    console.warn('Spotify album tracks failed:', album.id, err);
    return [];
  }
};

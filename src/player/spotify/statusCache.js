import { apiService } from '../../services/api';

// The Spotify status ({ allowed, connected, devices }) is fetched at most once per page load
// and shared by every caller. A failed fetch resolves to null and is not cached, so the next
// caller retries.
let statusPromise = null;

export const getSpotifyStatusCached = () => {
  if (!statusPromise) {
    const promise = apiService.getSpotifyStatus()
      .then((response) => response?.data ?? null)
      .catch((error) => {
        console.warn('Spotify status unavailable:', error);
        if (statusPromise === promise) statusPromise = null;
        return null;
      });
    statusPromise = promise;
  }
  return statusPromise;
};

export const invalidateSpotifyStatus = () => {
  statusPromise = null;
};

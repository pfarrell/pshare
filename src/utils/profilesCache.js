// src/utils/profilesCache.js
// Module-scope cache for the profile list, mirroring src/utils/tagsCache.js
// — fetched by every picker (header dropdown, Account page, jukebox's
// gear-icon picker), so this avoids a refetch on every mount.
import { apiService } from '../services/api';

let cachedProfilesPromise = null;

export const getProfilesCached = () => {
  if (!cachedProfilesPromise) {
    cachedProfilesPromise = apiService.getProfiles();
  }
  return cachedProfilesPromise;
};

export const __resetProfilesCacheForTests = () => { cachedProfilesPromise = null; };

// src/utils/profilesCache.js
// Module-scope cache for the profile list — fetched by every picker (header
// chip/dropdown, Account page, jukebox's gear-icon picker), so this avoids a
// refetch on every mount. Same pattern the old tag filter's tag-list cache
// used before profiles replaced it.
import { apiService } from '../services/api';

let cachedProfilesPromise = null;

export const getProfilesCached = () => {
  if (!cachedProfilesPromise) {
    cachedProfilesPromise = apiService.getProfiles();
  }
  return cachedProfilesPromise;
};

const reset = () => { cachedProfilesPromise = null; };

// Called by the admin pages after a create/update/delete: without this, every
// non-admin consumer (header chip/picker, jukebox picker) keeps serving the
// stale list for the rest of the page's lifetime — which on the jukebox kiosk
// can be days, since that Chromium tab is never reloaded.
export const invalidateProfilesCache = reset;

export const __resetProfilesCacheForTests = reset;

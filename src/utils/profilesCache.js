// src/utils/profilesCache.js
// Module-scope cache for the profile list — fetched by every picker (header
// chip/dropdown, Account page, jukebox's gear-icon picker), so this avoids a
// refetch on every mount. Same pattern the old tag filter's tag-list cache
// used before profiles replaced it.
import { apiService } from '../services/api';

let cachedProfilesPromise = null;

// Consumers that hold their own React-state copy of the profile list (rather
// than re-reading getProfilesCached() on every render) need to know when the
// cache is invalidated, since resetting the module-scope promise alone can't
// reach into their already-populated state. JukeboxProfilePicker is the
// motivating case: it never unmounts on a kiosk, so it needs a push rather
// than relying on a future remount to pick up fresh data.
const invalidationListeners = new Set();

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
export const invalidateProfilesCache = () => {
  reset();
  invalidationListeners.forEach((callback) => callback());
};

// Lets a component reset its own locally-cached copy of the profile list when
// invalidateProfilesCache() fires elsewhere (e.g. the jukebox SSE
// 'profiles-changed' event). Returns an unsubscribe function.
export const subscribeProfilesInvalidated = (callback) => {
  invalidationListeners.add(callback);
  return () => invalidationListeners.delete(callback);
};

export const __resetProfilesCacheForTests = () => {
  reset();
  invalidationListeners.clear();
};

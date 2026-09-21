const STORAGE_KEY = 'jukebox-mode';

export const isJukeboxMode = () => {
  try {
    return localStorage.getItem(STORAGE_KEY) === 'true';
  } catch {
    return false;
  }
};

// Reads a `?jukebox=1` / `?jukebox=0` query param (set once, from any device,
// to arm or disarm this browser's kiosk mode), persists it, and strips it
// from the URL so it doesn't linger. Returns whether the param was present.
export const applyJukeboxModeFromUrl = () => {
  const params = new URLSearchParams(window.location.search);
  if (!params.has('jukebox')) return false;

  const value = params.get('jukebox') === '1';
  try {
    localStorage.setItem(STORAGE_KEY, String(value));
  } catch {
    // localStorage unavailable (private mode, etc.) — the flag just won't
    // persist past this page load.
  }

  params.delete('jukebox');
  const newSearch = params.toString();
  const newUrl = window.location.pathname + (newSearch ? `?${newSearch}` : '') + window.location.hash;
  window.history.replaceState(null, '', newUrl);
  return true;
};

const STORAGE_KEY = 'jukebox-guest-name';

export const getStoredGuestName = () => {
  try {
    return localStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
};

export const setStoredGuestName = (name) => {
  try {
    localStorage.setItem(STORAGE_KEY, name);
  } catch {
    // localStorage unavailable — the name just won't persist past this page load.
  }
};

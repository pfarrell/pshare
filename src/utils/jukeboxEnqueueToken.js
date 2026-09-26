const STORAGE_KEY = 'jukebox-enqueue-token';

export const getStoredJukeboxToken = () => {
  try {
    return localStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
};

export const setStoredJukeboxToken = (token) => {
  try {
    localStorage.setItem(STORAGE_KEY, token);
  } catch {
    // localStorage unavailable — the token just won't persist past this page load.
  }
};

import { create } from 'zustand';

const STORAGE_KEY = 'jukebox-screensaver-mode';
const VALID_MODES = ['off', 'music', 'photos'];

// Defaults to 'music' — equivalent to the previous enabled-by-default
// behavior. A persisted value that isn't one of the three valid modes
// (there shouldn't be one, but localStorage is user-editable, and a kiosk
// upgraded from the old enabled/disabled store has a stale
// 'jukebox-screensaver-enabled' key under a different name entirely, which
// this simply never reads) falls back to the default.
const readStored = () => {
  const raw = localStorage.getItem(STORAGE_KEY);
  return VALID_MODES.includes(raw) ? raw : 'music';
};

export const useJukeboxScreensaverStore = create((set) => ({
  mode: readStored(),
  setMode: (mode) => {
    localStorage.setItem(STORAGE_KEY, mode);
    set({ mode });
  },
}));

import { create } from 'zustand';

const STORAGE_KEY = 'jukebox-screensaver-enabled';

// Defaults to enabled — a persisted 'false' is the only way to turn it off,
// matching viewModeStore's read-once-at-module-load pattern.
const readStored = () => {
  const raw = localStorage.getItem(STORAGE_KEY);
  return raw === null ? true : raw === 'true';
};

export const useJukeboxScreensaverStore = create((set) => ({
  enabled: readStored(),
  setEnabled: (enabled) => {
    localStorage.setItem(STORAGE_KEY, String(enabled));
    set({ enabled });
  },
}));

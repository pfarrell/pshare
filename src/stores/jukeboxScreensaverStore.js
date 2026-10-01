import { create } from 'zustand';

const STORAGE_KEY = 'jukebox-screensaver-mode';
const LEGACY_ENABLED_KEY = 'jukebox-screensaver-enabled';
const VALID_MODES = ['off', 'music', 'photos', 'visualizer'];

// Defaults to 'music' — equivalent to the previous enabled-by-default
// behavior. A persisted value that isn't one of the three valid modes
// (there shouldn't be one, but localStorage is user-editable) falls back to
// the default. A kiosk upgraded from the old on/off store has no new key
// yet, but may have explicitly turned the screensaver off under that old
// shape — that choice must carry forward as 'off' rather than silently
// re-enabling it; only a *missing* legacy key (never toggled either way)
// falls through to the 'music' default.
const readStored = () => {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (VALID_MODES.includes(raw)) return raw;
  if (localStorage.getItem(LEGACY_ENABLED_KEY) === 'false') return 'off';
  return 'music';
};

export const useJukeboxScreensaverStore = create((set) => ({
  mode: readStored(),
  setMode: (mode) => {
    localStorage.setItem(STORAGE_KEY, mode);
    set({ mode });
  },
}));

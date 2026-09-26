import { create } from 'zustand';

const STORAGE_KEY = 'profile-filter';

const readStored = () => {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) return null;
  const parsed = parseInt(raw, 10);
  return Number.isNaN(parsed) ? null : parsed;
};

export const useProfileFilterStore = create((set) => ({
  activeProfileId: readStored(),
  setProfile: (profileId) => {
    if (profileId) localStorage.setItem(STORAGE_KEY, String(profileId));
    else localStorage.removeItem(STORAGE_KEY);
    set({ activeProfileId: profileId || null });
  },
  clearProfile: () => {
    localStorage.removeItem(STORAGE_KEY);
    set({ activeProfileId: null });
  },
}));

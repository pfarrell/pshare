import { useEffect } from 'react';
import { usePlayerStore } from '../stores/playerStore';

// The kiosk's Bluetooth speaker ignores remote volume requests, so its dial stays high and the
// jukebox attenuates in software (playerStore.volume). The level lives in this browser only —
// it's about that speaker, not the account — and is applied on mount, before anything plays,
// so a Chromium restart never comes back at full dial volume.
export const JUKEBOX_VOLUME_KEY = 'jukebox-volume';
export const DEFAULT_JUKEBOX_VOLUME = 0.4;

const readSaved = () => {
  try {
    const raw = localStorage.getItem(JUKEBOX_VOLUME_KEY);
    const value = raw === null ? NaN : Number(raw);
    return Number.isFinite(value) && value >= 0 && value <= 1 ? value : DEFAULT_JUKEBOX_VOLUME;
  } catch {
    return DEFAULT_JUKEBOX_VOLUME;
  }
};

export const useJukeboxVolume = () => {
  useEffect(() => {
    usePlayerStore.getState().setVolume(readSaved());
    // Subscribed rather than saved by the slider, so any future source of changes (guest
    // phones) is persisted too.
    return usePlayerStore.subscribe((state, previous) => {
      if (state.volume === previous.volume) return;
      try {
        localStorage.setItem(JUKEBOX_VOLUME_KEY, String(state.volume));
      } catch {
        // Storage blocked: the level still applies for this session.
      }
    });
  }, []);
};

import { useEffect } from 'react';
import { apiService } from '../services/api';

// The music NAS spins its disks down when idle and takes 30s+ to wake. Ping the backend
// (POST /stream/warm) whenever someone starts using the app (it opens, comes back to the
// foreground, or gets a tap/click/keypress) so the spin-up overlaps browsing instead of
// landing on the first play. At most once per interval; the server throttles too.
export const WARMUP_INTERVAL_MS = 60_000;

// Module scope so StrictMode's double mount (and remounts) don't double-ping.
let lastWarmAt = -Infinity;

export const resetNasWarmupForTests = () => { lastWarmAt = -Infinity; };

const warm = () => {
  const now = Date.now();
  if (now - lastWarmAt < WARMUP_INTERVAL_MS) return;
  lastWarmAt = now;
  apiService.warmMusicStore().catch(() => {});
};

export const useNasWarmup = () => {
  useEffect(() => {
    warm();
    const onVisibility = () => {
      if (document.visibilityState === 'visible') warm();
    };
    const activity = ['pointerdown', 'keydown'];
    activity.forEach((type) => window.addEventListener(type, warm, { passive: true, capture: true }));
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      activity.forEach((type) => window.removeEventListener(type, warm, { capture: true }));
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, []);
};

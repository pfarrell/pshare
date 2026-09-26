import { applyJukeboxModeFromUrl, isJukeboxMode } from './jukebox/jukeboxMode';

// A jukebox kiosk is a fixed, always-online device — it never leaves the LAN
// and gets zero benefit from offline PWA support. Meanwhile a stuck-waiting
// service worker (see vite.config.js's workbox comment) silently serves
// stale JS/HTML indefinitely, including across a plain `sudo reboot`: a
// normal navigation is served by whichever SW was already active before a
// newer one gets the chance to activate, which for a kiosk's single
// perpetual tab may never happen on its own. Rather than fight that update
// timing, a kiosk never lets a service worker control it at all — and
// proactively unregisters/clears any that a prior *non-kiosk* visit to this
// same device may have installed, so switching a device into kiosk mode
// always ends with it running live, uncached code.
//
// `registerRealServiceWorker` is injectable so tests can exercise the
// kiosk/non-kiosk branch without resolving the real `virtual:pwa-register`
// module (only available inside an actual Vite build/dev server).
export const setUpServiceWorker = async ({
  registerRealServiceWorker = defaultRegisterRealServiceWorker,
} = {}) => {
  applyJukeboxModeFromUrl();

  if (isJukeboxMode()) {
    await unregisterAnyServiceWorker();
    return;
  }

  await registerRealServiceWorker();
};

const defaultRegisterRealServiceWorker = async () => {
  const { registerSW } = await import('virtual:pwa-register');
  registerSW({ immediate: true });
};

const unregisterAnyServiceWorker = async () => {
  if (!('serviceWorker' in navigator)) return;
  try {
    const registrations = await navigator.serviceWorker.getRegistrations();
    await Promise.all(registrations.map((registration) => registration.unregister()));

    if (typeof caches !== 'undefined') {
      const cacheKeys = await caches.keys();
      await Promise.all(cacheKeys.map((key) => caches.delete(key)));
    }
  } catch {
    // Best-effort cleanup — a device that's never run the normal app before
    // has nothing to unregister, and a failure here shouldn't block the app
    // from rendering.
  }
};

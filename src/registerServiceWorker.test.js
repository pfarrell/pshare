import { setUpServiceWorker } from './registerServiceWorker';

const STORAGE_KEY = 'jukebox-mode';

beforeEach(() => {
  localStorage.clear();
  window.history.replaceState(null, '', '/');
  delete navigator.serviceWorker;
  delete globalThis.caches;
});

test('non-kiosk mode registers the real service worker and leaves any existing registration alone', async () => {
  const getRegistrations = vi.fn();
  Object.defineProperty(navigator, 'serviceWorker', {
    value: { getRegistrations },
    configurable: true,
  });
  const registerRealServiceWorker = vi.fn().mockResolvedValue(undefined);

  await setUpServiceWorker({ registerRealServiceWorker });

  expect(registerRealServiceWorker).toHaveBeenCalledTimes(1);
  expect(getRegistrations).not.toHaveBeenCalled();
});

test('kiosk mode unregisters every existing service worker and clears caches instead of registering a new one', async () => {
  localStorage.setItem(STORAGE_KEY, 'true');
  const unregisterA = vi.fn().mockResolvedValue(true);
  const unregisterB = vi.fn().mockResolvedValue(true);
  Object.defineProperty(navigator, 'serviceWorker', {
    value: {
      getRegistrations: vi.fn().mockResolvedValue([
        { unregister: unregisterA },
        { unregister: unregisterB },
      ]),
    },
    configurable: true,
  });
  const cacheDelete = vi.fn().mockResolvedValue(true);
  globalThis.caches = { keys: vi.fn().mockResolvedValue(['workbox-precache-v1']), delete: cacheDelete };
  const registerRealServiceWorker = vi.fn();

  await setUpServiceWorker({ registerRealServiceWorker });

  expect(unregisterA).toHaveBeenCalledTimes(1);
  expect(unregisterB).toHaveBeenCalledTimes(1);
  expect(cacheDelete).toHaveBeenCalledWith('workbox-precache-v1');
  expect(registerRealServiceWorker).not.toHaveBeenCalled();
});

test('kiosk mode is a no-op, not a throw, when the browser has no serviceWorker support', async () => {
  localStorage.setItem(STORAGE_KEY, 'true');
  const registerRealServiceWorker = vi.fn();

  await expect(setUpServiceWorker({ registerRealServiceWorker })).resolves.toBeUndefined();
  expect(registerRealServiceWorker).not.toHaveBeenCalled();
});

test('applies a ?jukebox=1 param arriving on this very load before deciding', async () => {
  window.history.replaceState(null, '', '/?jukebox=1');
  const unregister = vi.fn().mockResolvedValue(true);
  Object.defineProperty(navigator, 'serviceWorker', {
    value: { getRegistrations: vi.fn().mockResolvedValue([{ unregister }]) },
    configurable: true,
  });
  globalThis.caches = { keys: vi.fn().mockResolvedValue([]), delete: vi.fn() };
  const registerRealServiceWorker = vi.fn();

  await setUpServiceWorker({ registerRealServiceWorker });

  expect(unregister).toHaveBeenCalledTimes(1);
  expect(registerRealServiceWorker).not.toHaveBeenCalled();
  expect(localStorage.getItem(STORAGE_KEY)).toBe('true');
});

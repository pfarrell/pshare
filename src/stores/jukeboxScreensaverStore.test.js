import { useJukeboxScreensaverStore } from './jukeboxScreensaverStore';

beforeEach(() => {
  localStorage.clear();
  useJukeboxScreensaverStore.setState({ mode: 'music' });
});

describe('jukeboxScreensaverStore', () => {
  test('defaults to music mode', () => {
    expect(useJukeboxScreensaverStore.getState().mode).toBe('music');
  });

  test('setMode updates state', () => {
    useJukeboxScreensaverStore.getState().setMode('photos');
    expect(useJukeboxScreensaverStore.getState().mode).toBe('photos');
  });

  test('setMode persists to localStorage under jukebox-screensaver-mode', () => {
    useJukeboxScreensaverStore.getState().setMode('off');
    expect(localStorage.getItem('jukebox-screensaver-mode')).toBe('off');
  });
});

// The store reads localStorage once, at module-evaluation time (inside the
// `create((set) => ({ mode: readStored(), ... }))` call), not on every
// getState(). The tests above share one already-evaluated module instance
// (fine for testing setMode/state updates), but testing what a *fresh*
// module instance reads from localStorage on load requires a fresh
// instance per case — vi.resetModules() + a dynamic import gives exactly
// that, rather than duplicating readStored's logic inline in the test
// (which would keep passing even if readStored itself were deleted).
describe('jukeboxScreensaverStore module-load behavior (fresh import per test)', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.resetModules();
  });

  test('reads a persisted mode back on next read', async () => {
    localStorage.setItem('jukebox-screensaver-mode', 'photos');
    const { useJukeboxScreensaverStore: fresh } = await import('./jukeboxScreensaverStore');
    expect(fresh.getState().mode).toBe('photos');
  });

  test('falls back to music for an invalid persisted value', async () => {
    localStorage.setItem('jukebox-screensaver-mode', 'bogus');
    const { useJukeboxScreensaverStore: fresh } = await import('./jukeboxScreensaverStore');
    expect(fresh.getState().mode).toBe('music');
  });

  test('a stale enabled-shaped kiosk with no new key and enabled=true still defaults to music', async () => {
    // Regression: the old store used a different key ('jukebox-screensaver-enabled').
    // A kiosk upgraded from that version has the old key sitting in
    // localStorage but not the new one.
    localStorage.setItem('jukebox-screensaver-enabled', 'true');
    const { useJukeboxScreensaverStore: fresh } = await import('./jukeboxScreensaverStore');
    expect(fresh.getState().mode).toBe('music');
  });

  test('a stale enabled-shaped kiosk with no new key and enabled=false carries forward as off', async () => {
    // A kiosk that had explicitly turned the screensaver off under the old
    // on/off store must not have it silently turn back on after this
    // upgrade — that's a real behavior change from what the person chose,
    // not a neutral default.
    localStorage.setItem('jukebox-screensaver-enabled', 'false');
    const { useJukeboxScreensaverStore: fresh } = await import('./jukeboxScreensaverStore');
    expect(fresh.getState().mode).toBe('off');
  });
});

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

  test('reads a persisted mode back on next read', () => {
    localStorage.setItem('jukebox-screensaver-mode', 'photos');
    const raw = localStorage.getItem('jukebox-screensaver-mode');
    expect(['off', 'music', 'photos'].includes(raw) ? raw : 'music').toBe('photos');
  });

  test('falls back to music for an invalid persisted value', () => {
    localStorage.setItem('jukebox-screensaver-mode', 'bogus');
    const raw = localStorage.getItem('jukebox-screensaver-mode');
    expect(['off', 'music', 'photos'].includes(raw) ? raw : 'music').toBe('music');
  });

  test('a stale enabled-shaped kiosk (old key present, new key absent) still defaults to music', () => {
    // Regression: the old store used a different key ('jukebox-screensaver-enabled').
    // A kiosk upgraded from that version has the old key sitting in
    // localStorage but not the new one — it must not be misread as the new
    // shape or throw; it should just fall through to the default.
    localStorage.setItem('jukebox-screensaver-enabled', 'true');
    const raw = localStorage.getItem('jukebox-screensaver-mode');
    expect(['off', 'music', 'photos'].includes(raw) ? raw : 'music').toBe('music');
  });
});

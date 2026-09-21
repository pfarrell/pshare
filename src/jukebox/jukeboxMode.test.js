import { isJukeboxMode, applyJukeboxModeFromUrl } from './jukeboxMode';

const STORAGE_KEY = 'jukebox-mode';

beforeEach(() => {
  localStorage.clear();
  window.history.replaceState(null, '', '/');
});

test('isJukeboxMode reads the persisted flag', () => {
  expect(isJukeboxMode()).toBe(false);
  localStorage.setItem(STORAGE_KEY, 'true');
  expect(isJukeboxMode()).toBe(true);
});

test('applyJukeboxModeFromUrl sets the flag from ?jukebox=1 and strips the param', () => {
  window.history.replaceState(null, '', '/?jukebox=1&foo=bar');
  const found = applyJukeboxModeFromUrl();
  expect(found).toBe(true);
  expect(isJukeboxMode()).toBe(true);
  expect(window.location.search).toBe('?foo=bar');
});

test('applyJukeboxModeFromUrl clears the flag from ?jukebox=0', () => {
  localStorage.setItem(STORAGE_KEY, 'true');
  window.history.replaceState(null, '', '/?jukebox=0');
  applyJukeboxModeFromUrl();
  expect(isJukeboxMode()).toBe(false);
});

test('applyJukeboxModeFromUrl is a no-op with no jukebox param', () => {
  localStorage.setItem(STORAGE_KEY, 'true');
  const found = applyJukeboxModeFromUrl();
  expect(found).toBe(false);
  expect(isJukeboxMode()).toBe(true);
});

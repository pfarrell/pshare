import { getStoredJukeboxToken, setStoredJukeboxToken } from './jukeboxEnqueueToken';

beforeEach(() => {
  localStorage.clear();
});

test('getStoredJukeboxToken returns null when nothing is stored', () => {
  expect(getStoredJukeboxToken()).toBeNull();
});

test('setStoredJukeboxToken then getStoredJukeboxToken round-trips', () => {
  setStoredJukeboxToken('abc123');
  expect(getStoredJukeboxToken()).toBe('abc123');
});

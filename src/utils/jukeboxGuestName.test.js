import { getStoredGuestName, setStoredGuestName } from './jukeboxGuestName';

beforeEach(() => {
  localStorage.clear();
});

test('getStoredGuestName returns null when nothing is stored', () => {
  expect(getStoredGuestName()).toBeNull();
});

test('setStoredGuestName then getStoredGuestName round-trips', () => {
  setStoredGuestName('Riley');
  expect(getStoredGuestName()).toBe('Riley');
});

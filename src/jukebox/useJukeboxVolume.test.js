import { renderHook } from '@testing-library/react';
import { usePlayerStore } from '../stores/playerStore';
import { useJukeboxVolume, JUKEBOX_VOLUME_KEY, DEFAULT_JUKEBOX_VOLUME } from './useJukeboxVolume';

beforeEach(() => {
  localStorage.clear();
  usePlayerStore.setState({ volume: 1, audioElementA: null, audioElementB: null, spotifySource: null });
});

test('applies a cautious default the first time', () => {
  renderHook(() => useJukeboxVolume());
  expect(DEFAULT_JUKEBOX_VOLUME).toBe(0.4);
  expect(usePlayerStore.getState().volume).toBe(0.4);
});

test('applies the saved level on mount', () => {
  localStorage.setItem(JUKEBOX_VOLUME_KEY, '0.7');
  renderHook(() => useJukeboxVolume());
  expect(usePlayerStore.getState().volume).toBe(0.7);
});

test('ignores a garbage saved value', () => {
  localStorage.setItem(JUKEBOX_VOLUME_KEY, 'loud');
  renderHook(() => useJukeboxVolume());
  expect(usePlayerStore.getState().volume).toBe(0.4);
});

test('saves later changes, and stops saving after unmount', () => {
  const { unmount } = renderHook(() => useJukeboxVolume());
  usePlayerStore.getState().setVolume(0.55);
  expect(localStorage.getItem(JUKEBOX_VOLUME_KEY)).toBe('0.55');
  unmount();
  usePlayerStore.getState().setVolume(0.9);
  expect(localStorage.getItem(JUKEBOX_VOLUME_KEY)).toBe('0.55');
});

test('works when storage throws', () => {
  const get = vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new Error('blocked'); });
  const setItem = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('blocked'); });
  renderHook(() => useJukeboxVolume());
  expect(usePlayerStore.getState().volume).toBe(0.4);
  expect(() => usePlayerStore.getState().setVolume(0.6)).not.toThrow();
  get.mockRestore();
  setItem.mockRestore();
});

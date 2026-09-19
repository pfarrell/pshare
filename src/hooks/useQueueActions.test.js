// src/hooks/useQueueActions.test.js
import { renderHook, act, waitFor } from '@testing-library/react';
import { useQueueActions } from './useQueueActions';
import { usePlayerStore } from '../stores/playerStore';
import { describe, test, expect, beforeEach, afterEach, vi } from 'vitest';

const tracks = [{ id: 1 }, { id: 2 }];
let addTracks;
let setPlaylist;
let original;

beforeEach(() => {
  original = usePlayerStore.getState();
  addTracks = vi.fn();
  setPlaylist = vi.fn();
  usePlayerStore.setState({ addTracks, setPlaylist });
});

afterEach(() => {
  usePlayerStore.setState({ addTracks: original.addTracks, setPlaylist: original.setPlaylist });
});

describe('useQueueActions', () => {
  test('value source: each action dispatches and runs afterEnqueue', () => {
    const afterEnqueue = vi.fn();
    const { result } = renderHook(() => useQueueActions(tracks, { afterEnqueue }));
    act(() => { result.current.playAll(); });
    act(() => { result.current.playNow(); });
    act(() => { result.current.playNext(); });
    act(() => { result.current.addToQueue(); });
    expect(addTracks.mock.calls).toEqual([
      [tracks, false, { flashActivity: true }],
      [tracks, true, { flashActivity: true }],
      [tracks, false, { flashActivity: true }],
    ]);
    expect(setPlaylist).toHaveBeenCalledWith(tracks);
    expect(afterEnqueue).toHaveBeenCalledTimes(4);
  });

  test('async source: loading toggles and tracks are fetched per action', async () => {
    let resolve;
    const source = vi.fn(() => new Promise((r) => { resolve = r; }));
    const { result } = renderHook(() => useQueueActions(source));
    let pending;
    act(() => { pending = result.current.playNext(); });
    expect(result.current.loading).toBe(true);
    await act(async () => { resolve(tracks); await pending; });
    expect(result.current.loading).toBe(false);
    expect(addTracks).toHaveBeenCalledWith(tracks, true, { flashActivity: true });
  });

  test('async failure logs and does not dispatch', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const { result } = renderHook(() => useQueueActions(() => Promise.reject(new Error('x')), { errorLabel: 'Failed to play album' }));
    await act(async () => { await result.current.playAll(); });
    expect(spy).toHaveBeenCalledWith('Failed to play album', expect.any(Error));
    expect(addTracks).not.toHaveBeenCalled();
    await waitFor(() => expect(result.current.loading).toBe(false));
    spy.mockRestore();
  });

  test('empty or missing tracks is a no-op', () => {
    const afterEnqueue = vi.fn();
    const { result, rerender } = renderHook(({ src }) => useQueueActions(src, { afterEnqueue }), { initialProps: { src: [] } });
    act(() => { result.current.playAll(); });
    rerender({ src: undefined });
    act(() => { result.current.playNow(); });
    expect(addTracks).not.toHaveBeenCalled();
    expect(setPlaylist).not.toHaveBeenCalled();
    expect(afterEnqueue).not.toHaveBeenCalled();
  });
});

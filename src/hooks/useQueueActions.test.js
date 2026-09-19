// src/hooks/useQueueActions.test.js
import { renderHook, act, waitFor } from '@testing-library/react';
import { useQueueActions } from './useQueueActions';
import { usePlayerStore } from '../stores/playerStore';
import { describe, test, expect, beforeEach, afterEach, vi } from 'vitest';

const tracks = [{ id: 1 }, { id: 2 }];
let addTracks;
let setQueueSource;
let original;

beforeEach(() => {
  original = usePlayerStore.getState();
  addTracks = vi.fn();
  setQueueSource = vi.fn();
  usePlayerStore.setState({ addTracks, setQueueSource });
});

afterEach(() => {
  usePlayerStore.setState({ addTracks: original.addTracks, setQueueSource: original.setQueueSource });
});

describe('useQueueActions', () => {
  test('play appends and jumps immediately, and tags queueSource', () => {
    const { result } = renderHook(() => useQueueActions(tracks, { queueSource: { type: 'album', id: 7 } }));
    act(() => { result.current.play(); });
    expect(addTracks).toHaveBeenCalledWith(tracks, false, { flashActivity: true, playImmediately: true });
    expect(setQueueSource).toHaveBeenCalledWith({ type: 'album', id: 7 });
  });

  test('playNext and addToQueue do not tag queueSource', () => {
    const { result } = renderHook(() => useQueueActions(tracks, { queueSource: { type: 'album', id: 7 } }));
    act(() => { result.current.playNext(); });
    act(() => { result.current.addToQueue(); });
    expect(addTracks.mock.calls).toEqual([
      [tracks, true, { flashActivity: true }],
      [tracks, false, { flashActivity: true }],
    ]);
    expect(setQueueSource).not.toHaveBeenCalled();
  });

  test('play does not tag queueSource when none was provided', () => {
    const { result } = renderHook(() => useQueueActions(tracks));
    act(() => { result.current.play(); });
    expect(addTracks).toHaveBeenCalled();
    expect(setQueueSource).not.toHaveBeenCalled();
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
    await act(async () => { await result.current.play(); });
    expect(spy).toHaveBeenCalledWith('Failed to play album', expect.any(Error));
    expect(addTracks).not.toHaveBeenCalled();
    await waitFor(() => expect(result.current.loading).toBe(false));
    spy.mockRestore();
  });

  test('empty or missing tracks is a no-op', () => {
    const { result, rerender } = renderHook(({ src }) => useQueueActions(src, { queueSource: { type: 'album', id: 7 } }), { initialProps: { src: [] } });
    act(() => { result.current.play(); });
    rerender({ src: undefined });
    act(() => { result.current.play(); });
    expect(addTracks).not.toHaveBeenCalled();
    expect(setQueueSource).not.toHaveBeenCalled();
  });
});

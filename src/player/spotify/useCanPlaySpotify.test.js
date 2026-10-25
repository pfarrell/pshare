import { describe, test, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, waitFor, act } from '@testing-library/react';

const status = { value: null };
vi.mock('./statusCache', () => ({ getSpotifyStatusCached: () => Promise.resolve(status.value) }));
vi.mock('./eligibility', () => ({ canPlaySpotify: ({ status: s }) => !!s?.connected }));
vi.mock('../../utils/device', () => ({ isIOSDevice: () => false }));

import { usePlayerStore } from '../../stores/playerStore';
import { useSpotifyPlayability, SOURCE_WAIT_MS } from './useCanPlaySpotify';

beforeEach(() => usePlayerStore.setState({ spotifySource: null }));
afterEach(() => vi.useRealTimers());

describe('useSpotifyPlayability', () => {
  test("is 'checking' until status resolves, then 'unavailable' when ineligible", async () => {
    status.value = { connected: false };
    const { result } = renderHook(() => useSpotifyPlayability());
    expect(result.current).toBe('checking');
    await waitFor(() => expect(result.current).toBe('unavailable'));
  });

  test("eligible but no source yet stays 'checking', then 'ready' once a source registers", async () => {
    status.value = { connected: true };
    const { result } = renderHook(() => useSpotifyPlayability());
    await new Promise((r) => setTimeout(r, 0));
    expect(result.current).toBe('checking');
    act(() => usePlayerStore.setState({ spotifySource: {} }));
    expect(result.current).toBe('ready');
  });

  test("eligible but the source never registers gives up as 'unavailable' after SOURCE_WAIT_MS", async () => {
    vi.useFakeTimers();
    status.value = { connected: true };
    const { result } = renderHook(() => useSpotifyPlayability());
    await act(async () => { await Promise.resolve(); await Promise.resolve(); });
    expect(result.current).toBe('checking');
    act(() => { vi.advanceTimersByTime(SOURCE_WAIT_MS); });
    expect(result.current).toBe('unavailable');
  });
});

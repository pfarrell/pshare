import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { markOutgoingEnd, markIncomingAudible, clearPendingTransition, isTransitionTimingEnabled } from './transitionTimer';

describe('transitionTimer', () => {
  let log;
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(1000000);
    log = vi.spyOn(console, 'log').mockImplementation(() => {});
  });
  afterEach(() => {
    localStorage.clear();
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('logs nothing when the flag is off', () => {
    markOutgoingEnd('local');
    vi.advanceTimersByTime(400);
    markIncomingAudible('spotify');
    expect(log).not.toHaveBeenCalled();
  });

  it('logs one line with the gap when enabled', () => {
    localStorage.setItem('pshare-debug-transitions', '1');
    markOutgoingEnd('local');
    vi.advanceTimersByTime(412);
    markIncomingAudible('spotify');
    expect(log).toHaveBeenCalledTimes(1);
    expect(log).toHaveBeenCalledWith('[transition] local→spotify gap 412ms');
    markIncomingAudible('spotify');
    expect(log).toHaveBeenCalledTimes(1);
  });

  it('supports an estimated outgoing end time (negative gap = overlap)', () => {
    localStorage.setItem('pshare-debug-transitions', '1');
    markOutgoingEnd('spotify', Date.now() + 200);
    markIncomingAudible('local');
    expect(log).toHaveBeenCalledWith('[transition] spotify→local gap -200ms');
  });

  it('ignores local→local and stale marks', () => {
    localStorage.setItem('pshare-debug-transitions', '1');
    markOutgoingEnd('local');
    markIncomingAudible('local');
    markOutgoingEnd('spotify');
    vi.advanceTimersByTime(20000);
    markIncomingAudible('local');
    expect(log).not.toHaveBeenCalled();
  });

  it('clearing the pending mark prevents a later log', () => {
    localStorage.setItem('pshare-debug-transitions', '1');
    markOutgoingEnd('spotify');
    clearPendingTransition();
    markIncomingAudible('local');
    expect(log).not.toHaveBeenCalled();
  });

  it('reports whether the flag is on', () => {
    expect(isTransitionTimingEnabled()).toBe(false);
    localStorage.setItem('pshare-debug-transitions', '1');
    expect(isTransitionTimingEnabled()).toBe(true);
  });

  it('never throws when localStorage is unavailable', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new Error('denied'); });
    expect(() => { markOutgoingEnd('local'); markIncomingAudible('spotify'); }).not.toThrow();
  });
});

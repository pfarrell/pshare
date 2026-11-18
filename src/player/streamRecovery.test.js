import { describe, test, expect } from 'vitest';
import { isPrematureEnd, nextRecovery, retryDelayMs, MAX_STREAM_RETRIES } from './streamRecovery';

describe('isPrematureEnd', () => {
  test('an end well short of the known duration is premature', () => {
    expect(isPrematureEnd(42, 180)).toBe(true);
  });

  test('an end within a few seconds of the known duration is a real end', () => {
    expect(isPrematureEnd(178, 180)).toBe(false);
    expect(isPrematureEnd(180, 180)).toBe(false);
  });

  test('without a usable duration, an end is taken at face value', () => {
    expect(isPrematureEnd(10, 0)).toBe(false);
    expect(isPrematureEnd(10, undefined)).toBe(false);
    expect(isPrematureEnd(10, NaN)).toBe(false);
  });
});

describe('nextRecovery', () => {
  test('the first failure of a track is attempt 1', () => {
    expect(nextRecovery(null, { url: '/stream/1', position: 30 })).toEqual({ url: '/stream/1', position: 30, attempts: 1, giveUp: false });
  });

  test('repeated failures at the same spot count up and eventually give up', () => {
    let r = null;
    for (let i = 1; i <= MAX_STREAM_RETRIES; i++) {
      r = nextRecovery(r, { url: '/stream/1', position: 30 });
      expect(r.attempts).toBe(i);
      expect(r.giveUp).toBe(false);
    }
    expect(nextRecovery(r, { url: '/stream/1', position: 31 }).giveUp).toBe(true);
  });

  test('a failure after real progress starts a fresh budget', () => {
    const r = { url: '/stream/1', position: 30, attempts: MAX_STREAM_RETRIES, giveUp: false };
    expect(nextRecovery(r, { url: '/stream/1', position: 90 }).attempts).toBe(1);
  });

  test('a failure on a different track starts a fresh budget', () => {
    const r = { url: '/stream/1', position: 30, attempts: MAX_STREAM_RETRIES, giveUp: false };
    expect(nextRecovery(r, { url: '/stream/2', position: 30 }).attempts).toBe(1);
  });
});

test('retry delays back off', () => {
  expect(retryDelayMs(1)).toBeLessThan(retryDelayMs(2));
  expect(retryDelayMs(2)).toBeLessThan(retryDelayMs(3));
});

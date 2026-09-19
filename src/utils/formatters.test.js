import { formatDuration, formatCount, getAlbumYear, formatPlaybackTime } from './formatters';

describe('formatDuration', () => {
  test('returns empty string for 0', () => {
    expect(formatDuration(0)).toBe('');
  });

  test('returns empty string for undefined', () => {
    expect(formatDuration(undefined)).toBe('');
  });

  test('returns empty string for NaN', () => {
    expect(formatDuration(NaN)).toBe('');
  });

  test('formats seconds under one minute', () => {
    expect(formatDuration(59)).toBe('0:59');
  });

  test('formats exactly one minute', () => {
    expect(formatDuration(60)).toBe('1:00');
  });

  test('formats minutes and seconds', () => {
    expect(formatDuration(61)).toBe('1:01');
  });

  test('pads single-digit seconds with leading zero', () => {
    expect(formatDuration(65)).toBe('1:05');
  });

  test('formats durations over one hour', () => {
    expect(formatDuration(3661)).toBe('61:01');
  });
});

describe('formatCount', () => {
  test('returns null for null count', () => {
    expect(formatCount(null, 'track')).toBeNull();
  });

  test('returns null for undefined count', () => {
    expect(formatCount(undefined, 'track')).toBeNull();
  });

  test('uses singular for a count of 1', () => {
    expect(formatCount(1, 'track')).toBe('1 track');
  });

  test('uses default pluralization for counts other than 1', () => {
    expect(formatCount(0, 'track')).toBe('0 tracks');
    expect(formatCount(5, 'track')).toBe('5 tracks');
  });

  test('uses an explicit plural form when given one', () => {
    expect(formatCount(2, 'album', 'albums')).toBe('2 albums');
  });
});

describe('getAlbumYear', () => {
  test('returns the year when present', () => {
    expect(getAlbumYear('1969')).toBe('1969');
  });

  test('returns null for null', () => {
    expect(getAlbumYear(null)).toBeNull();
  });

  test('returns null for undefined', () => {
    expect(getAlbumYear(undefined)).toBeNull();
  });

  test('returns null for an empty string', () => {
    expect(getAlbumYear('')).toBeNull();
  });

  test('returns null for the sentinel "0"', () => {
    expect(getAlbumYear('0')).toBeNull();
  });
});

describe('formatPlaybackTime', () => {
  test('returns 0:00 for 0, undefined, NaN and Infinity', () => {
    expect(formatPlaybackTime(0)).toBe('0:00');
    expect(formatPlaybackTime(undefined)).toBe('0:00');
    expect(formatPlaybackTime(NaN)).toBe('0:00');
    expect(formatPlaybackTime(Infinity)).toBe('0:00');
  });

  test('floors fractional seconds (audio currentTime is fractional)', () => {
    expect(formatPlaybackTime(65.9)).toBe('1:05');
  });

  test('pads seconds and does not roll minutes into hours', () => {
    expect(formatPlaybackTime(9)).toBe('0:09');
    expect(formatPlaybackTime(600)).toBe('10:00');
    expect(formatPlaybackTime(3661)).toBe('61:01');
  });
});

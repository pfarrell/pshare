import { plural } from './plural';

test('pluralizes numbers', () => {
  expect(plural(1, 'album')).toBe('1 album');
  expect(plural(0, 'album')).toBe('0 albums');
  expect(plural(12, 'track')).toBe('12 tracks');
});

test('treats numeric strings from Postgres bigint counts as numbers', () => {
  expect(plural('1', 'album')).toBe('1 album');
  expect(plural('3', 'album')).toBe('3 albums');
});

test('returns an empty string for a missing or non-numeric count', () => {
  expect(plural(null, 'album')).toBe('');
  expect(plural(undefined, 'album')).toBe('');
  expect(plural('abc', 'album')).toBe('');
});

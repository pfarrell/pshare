import { toFilename } from './filenames';

describe('toFilename', () => {
  test('lowercases and collapses non-alphanumeric runs to one underscore', () => {
    expect(toFilename('The Beatles')).toBe('the_beatles');
    expect(toFilename("Guns N' Roses")).toBe('guns_n_roses');
  });

  test('trims leading and trailing underscores', () => {
    expect(toFilename('  !!Abbey Road!! ')).toBe('abbey_road');
  });

  test('returns empty string for empty input', () => {
    expect(toFilename('')).toBe('');
  });
});

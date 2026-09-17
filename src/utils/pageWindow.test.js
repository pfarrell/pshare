import { pageWindow } from './pageWindow';

describe('pageWindow', () => {
  test('all pages when there are 5 or fewer', () => {
    expect(pageWindow(1, 3)).toEqual([1, 2, 3]);
    expect(pageWindow(5, 5)).toEqual([1, 2, 3, 4, 5]);
  });

  test('pins to the start, centers, and pins to the end', () => {
    expect(pageWindow(2, 10)).toEqual([1, 2, 3, 4, 5]);
    expect(pageWindow(5, 10)).toEqual([3, 4, 5, 6, 7]);
    expect(pageWindow(9, 10)).toEqual([6, 7, 8, 9, 10]);
  });
});

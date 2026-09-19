import { moveItem, moveToEdge } from './reorder';

describe('moveItem', () => {
  const list = ['a', 'b', 'c', 'd'];

  test('moving down onto the top half of a row lands just before it', () => {
    expect(moveItem(list, 0, 2, 'before')).toEqual(['b', 'a', 'c', 'd']);
  });

  test('moving down onto the bottom half lands just after it', () => {
    expect(moveItem(list, 0, 2, 'after')).toEqual(['b', 'c', 'a', 'd']);
  });

  test('moving up', () => {
    expect(moveItem(list, 3, 1, 'before')).toEqual(['a', 'd', 'b', 'c']);
    expect(moveItem(list, 3, 0, 'after')).toEqual(['a', 'd', 'b', 'c']);
  });

  test('out-of-range indexes return the original list', () => {
    expect(moveItem(list, -1, 2, 'before')).toBe(list);
    expect(moveItem(list, 0, 9, 'before')).toBe(list);
  });
});

describe('moveToEdge', () => {
  test('top and bottom', () => {
    expect(moveToEdge(['a', 'b', 'c'], 2, 'top')).toEqual(['c', 'a', 'b']);
    expect(moveToEdge(['a', 'b', 'c'], 0, 'bottom')).toEqual(['b', 'c', 'a']);
  });
});

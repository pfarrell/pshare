import { renderHook } from '@testing-library/react';
import { useTouchScroll } from './useTouchScroll';

const makeTouchEvent = (type, x, y) => {
  const event = new Event(type, { bubbles: true, cancelable: true });
  Object.defineProperty(event, 'touches', { value: [{ clientX: x, clientY: y }], enumerable: true });
  return event;
};

// jsdom's scrollTop/scrollLeft are inert (no real layout), so shadow them
// with a plain writable own-property to make them behave like a real,
// settable value for these tests.
const makeScrollableDiv = (prop) => {
  const el = document.createElement('div');
  Object.defineProperty(el, prop, { value: 0, writable: true });
  document.body.appendChild(el);
  return el;
};

test('drags scrollTop based on vertical touch movement past the threshold', () => {
  const el = makeScrollableDiv('scrollTop');
  renderHook(() => useTouchScroll({ current: el }, { axis: 'y' }));

  el.dispatchEvent(makeTouchEvent('touchstart', 100, 100));
  el.dispatchEvent(makeTouchEvent('touchmove', 100, 70)); // finger moved up 30px -> content scrolls down 30px

  expect(el.scrollTop).toBe(30);
  document.body.removeChild(el);
});

test('does not scroll for movement under the drag threshold', () => {
  const el = makeScrollableDiv('scrollTop');
  renderHook(() => useTouchScroll({ current: el }, { axis: 'y' }));

  el.dispatchEvent(makeTouchEvent('touchstart', 100, 100));
  el.dispatchEvent(makeTouchEvent('touchmove', 100, 97)); // 3px, under the 6px threshold

  expect(el.scrollTop).toBe(0);
  document.body.removeChild(el);
});

test('horizontal axis drags scrollLeft instead of scrollTop', () => {
  const el = makeScrollableDiv('scrollLeft');
  renderHook(() => useTouchScroll({ current: el }, { axis: 'x' }));

  el.dispatchEvent(makeTouchEvent('touchstart', 200, 50));
  el.dispatchEvent(makeTouchEvent('touchmove', 170, 50)); // finger moved left 30px -> content scrolls right 30px

  expect(el.scrollLeft).toBe(30);
  document.body.removeChild(el);
});

test('ignores a drag that is mostly along the other axis', () => {
  const el = makeScrollableDiv('scrollTop');
  renderHook(() => useTouchScroll({ current: el }, { axis: 'y' }));

  el.dispatchEvent(makeTouchEvent('touchstart', 100, 100));
  el.dispatchEvent(makeTouchEvent('touchmove', 130, 105)); // dx=30, dy=5 — mostly horizontal, not a y-axis scroll

  expect(el.scrollTop).toBe(0);
  document.body.removeChild(el);
});

test('a scroll gesture continues tracking across multiple touchmove events', () => {
  const el = makeScrollableDiv('scrollTop');
  renderHook(() => useTouchScroll({ current: el }, { axis: 'y' }));

  el.dispatchEvent(makeTouchEvent('touchstart', 100, 200));
  el.dispatchEvent(makeTouchEvent('touchmove', 100, 170)); // -30
  expect(el.scrollTop).toBe(30);
  el.dispatchEvent(makeTouchEvent('touchmove', 100, 150)); // -50 total from start
  expect(el.scrollTop).toBe(50);
  document.body.removeChild(el);
});

test('cleans up its listeners on unmount', () => {
  const el = makeScrollableDiv('scrollTop');
  const { unmount } = renderHook(() => useTouchScroll({ current: el }, { axis: 'y' }));
  unmount();

  el.dispatchEvent(makeTouchEvent('touchstart', 100, 100));
  el.dispatchEvent(makeTouchEvent('touchmove', 100, 50));

  expect(el.scrollTop).toBe(0);
  document.body.removeChild(el);
});

test('does nothing when the ref has no current element', () => {
  expect(() => renderHook(() => useTouchScroll({ current: null }, { axis: 'y' }))).not.toThrow();
});

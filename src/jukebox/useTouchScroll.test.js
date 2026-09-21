import { vi } from 'vitest';
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

test('attaches listeners as soon as the callback ref receives an element, even on a later render than the one that first called the hook', () => {
  // Simulates a conditionally-rendered element (e.g. a loading state that
  // resolves) mounting after the hook itself already ran once — the exact
  // bug this callback-ref design exists to avoid.
  const el = makeScrollableDiv('scrollTop');
  const { result } = renderHook(() => useTouchScroll({ axis: 'y' }));

  result.current(el);

  el.dispatchEvent(makeTouchEvent('touchstart', 100, 100));
  el.dispatchEvent(makeTouchEvent('touchmove', 100, 70));

  expect(el.scrollTop).toBe(30);
  document.body.removeChild(el);
});

test('drags scrollTop based on vertical touch movement past the threshold', () => {
  const el = makeScrollableDiv('scrollTop');
  const { result } = renderHook(() => useTouchScroll({ axis: 'y' }));
  result.current(el);

  el.dispatchEvent(makeTouchEvent('touchstart', 100, 100));
  el.dispatchEvent(makeTouchEvent('touchmove', 100, 70)); // finger moved up 30px -> content scrolls down 30px

  expect(el.scrollTop).toBe(30);
  document.body.removeChild(el);
});

test('does not scroll for movement under the drag threshold', () => {
  const el = makeScrollableDiv('scrollTop');
  const { result } = renderHook(() => useTouchScroll({ axis: 'y' }));
  result.current(el);

  el.dispatchEvent(makeTouchEvent('touchstart', 100, 100));
  el.dispatchEvent(makeTouchEvent('touchmove', 100, 97)); // 3px, under the 6px threshold

  expect(el.scrollTop).toBe(0);
  document.body.removeChild(el);
});

test('horizontal axis drags scrollLeft instead of scrollTop', () => {
  const el = makeScrollableDiv('scrollLeft');
  const { result } = renderHook(() => useTouchScroll({ axis: 'x' }));
  result.current(el);

  el.dispatchEvent(makeTouchEvent('touchstart', 200, 50));
  el.dispatchEvent(makeTouchEvent('touchmove', 170, 50)); // finger moved left 30px -> content scrolls right 30px

  expect(el.scrollLeft).toBe(30);
  document.body.removeChild(el);
});

test('ignores a drag that is mostly along the other axis', () => {
  const el = makeScrollableDiv('scrollTop');
  const { result } = renderHook(() => useTouchScroll({ axis: 'y' }));
  result.current(el);

  el.dispatchEvent(makeTouchEvent('touchstart', 100, 100));
  el.dispatchEvent(makeTouchEvent('touchmove', 130, 105)); // dx=30, dy=5 — mostly horizontal, not a y-axis scroll

  expect(el.scrollTop).toBe(0);
  document.body.removeChild(el);
});

test('a scroll gesture continues tracking across multiple touchmove events', () => {
  const el = makeScrollableDiv('scrollTop');
  const { result } = renderHook(() => useTouchScroll({ axis: 'y' }));
  result.current(el);

  el.dispatchEvent(makeTouchEvent('touchstart', 100, 200));
  el.dispatchEvent(makeTouchEvent('touchmove', 100, 170)); // -30
  expect(el.scrollTop).toBe(30);
  el.dispatchEvent(makeTouchEvent('touchmove', 100, 150)); // -50 total from start
  expect(el.scrollTop).toBe(50);
  document.body.removeChild(el);
});

test('detaches old listeners when the ref moves to a different element', () => {
  const el1 = makeScrollableDiv('scrollTop');
  const el2 = makeScrollableDiv('scrollTop');
  const { result } = renderHook(() => useTouchScroll({ axis: 'y' }));

  result.current(el1);
  result.current(null); // React calls the ref with null on unmount before a new node, if any
  result.current(el2);

  el1.dispatchEvent(makeTouchEvent('touchstart', 100, 100));
  el1.dispatchEvent(makeTouchEvent('touchmove', 100, 50));
  expect(el1.scrollTop).toBe(0); // el1 is no longer wired up

  el2.dispatchEvent(makeTouchEvent('touchstart', 100, 100));
  el2.dispatchEvent(makeTouchEvent('touchmove', 100, 50));
  expect(el2.scrollTop).toBe(50);

  document.body.removeChild(el1);
  document.body.removeChild(el2);
});

test('does nothing when called with null', () => {
  const { result } = renderHook(() => useTouchScroll({ axis: 'y' }));
  expect(() => result.current(null)).not.toThrow();
});

// --- Mouse-like pointer input -------------------------------------------
// The Pi kiosk's touchscreen reaches Chromium as a *mouse* (recorded from real
// drags: pointerdown/mousedown/pointermove/mouseup/click, zero touch events),
// so touch-event handling alone never fires there.
const makePointerEvent = (type, x, y, extra = {}) => {
  const event = new Event(type, { bubbles: true, cancelable: true });
  Object.defineProperties(event, {
    clientX: { value: x, enumerable: true },
    clientY: { value: y, enumerable: true },
    pointerType: { value: extra.pointerType ?? 'mouse', enumerable: true },
    pointerId: { value: 1, enumerable: true },
    button: { value: extra.button ?? 0, enumerable: true },
  });
  return event;
};

describe('mouse-like pointer input', () => {
  test('dragging with a mouse pointer scrolls, like a touch drag', () => {
    const el = makeScrollableDiv('scrollTop');
    const { result } = renderHook(() => useTouchScroll({ axis: 'y' }));
    result.current(el);

    el.dispatchEvent(makePointerEvent('pointerdown', 100, 100));
    el.dispatchEvent(makePointerEvent('pointermove', 100, 70));
    expect(el.scrollTop).toBe(30);
    el.dispatchEvent(makePointerEvent('pointermove', 100, 40));
    expect(el.scrollTop).toBe(60);
    el.dispatchEvent(makePointerEvent('pointerup', 100, 40));
    document.body.removeChild(el);
  });

  test('horizontal axis drags scrollLeft with a mouse pointer', () => {
    const el = makeScrollableDiv('scrollLeft');
    const { result } = renderHook(() => useTouchScroll({ axis: 'x' }));
    result.current(el);

    el.dispatchEvent(makePointerEvent('pointerdown', 200, 50));
    el.dispatchEvent(makePointerEvent('pointermove', 170, 50));

    expect(el.scrollLeft).toBe(30);
    document.body.removeChild(el);
  });

  test('does not scroll for pointer movement under the drag threshold', () => {
    const el = makeScrollableDiv('scrollTop');
    const { result } = renderHook(() => useTouchScroll({ axis: 'y' }));
    result.current(el);

    el.dispatchEvent(makePointerEvent('pointerdown', 100, 100));
    el.dispatchEvent(makePointerEvent('pointermove', 100, 97));

    expect(el.scrollTop).toBe(0);
    document.body.removeChild(el);
  });

  test('does not move the scroll position on pointermove without a preceding pointerdown', () => {
    const el = makeScrollableDiv('scrollTop');
    const { result } = renderHook(() => useTouchScroll({ axis: 'y' }));
    result.current(el);

    el.dispatchEvent(makePointerEvent('pointermove', 100, 100));
    el.dispatchEvent(makePointerEvent('pointermove', 100, 40));

    expect(el.scrollTop).toBe(0);
    document.body.removeChild(el);
  });

  test('stops scrolling after pointerup', () => {
    const el = makeScrollableDiv('scrollTop');
    const { result } = renderHook(() => useTouchScroll({ axis: 'y' }));
    result.current(el);

    el.dispatchEvent(makePointerEvent('pointerdown', 100, 100));
    el.dispatchEvent(makePointerEvent('pointermove', 100, 70));
    el.dispatchEvent(makePointerEvent('pointerup', 100, 70));
    el.dispatchEvent(makePointerEvent('pointermove', 100, 10));

    expect(el.scrollTop).toBe(30);
    document.body.removeChild(el);
  });

  test('ignores touch-type pointers (real touch events already handle those; handling both would double-scroll)', () => {
    const el = makeScrollableDiv('scrollTop');
    const { result } = renderHook(() => useTouchScroll({ axis: 'y' }));
    result.current(el);

    el.dispatchEvent(makePointerEvent('pointerdown', 100, 100, { pointerType: 'touch' }));
    el.dispatchEvent(makePointerEvent('pointermove', 100, 70, { pointerType: 'touch' }));

    expect(el.scrollTop).toBe(0);
    document.body.removeChild(el);
  });

  test('ignores non-primary mouse buttons', () => {
    const el = makeScrollableDiv('scrollTop');
    const { result } = renderHook(() => useTouchScroll({ axis: 'y' }));
    result.current(el);

    el.dispatchEvent(makePointerEvent('pointerdown', 100, 100, { button: 2 }));
    el.dispatchEvent(makePointerEvent('pointermove', 100, 70));

    expect(el.scrollTop).toBe(0);
    document.body.removeChild(el);
  });

  test('does not hijack a drag that starts inside a text input', () => {
    const el = makeScrollableDiv('scrollTop');
    const input = document.createElement('input');
    el.appendChild(input);
    const { result } = renderHook(() => useTouchScroll({ axis: 'y' }));
    result.current(el);

    input.dispatchEvent(makePointerEvent('pointerdown', 100, 100));
    input.dispatchEvent(makePointerEvent('pointermove', 100, 70));

    expect(el.scrollTop).toBe(0);
    document.body.removeChild(el);
  });

  test('suppresses the click that follows a drag so it cannot activate what is under the finger', () => {
    const el = makeScrollableDiv('scrollTop');
    const button = document.createElement('button');
    el.appendChild(button);
    const onClick = vi.fn();
    button.addEventListener('click', onClick);
    const { result } = renderHook(() => useTouchScroll({ axis: 'y' }));
    result.current(el);

    button.dispatchEvent(makePointerEvent('pointerdown', 100, 100));
    button.dispatchEvent(makePointerEvent('pointermove', 100, 60));
    button.dispatchEvent(makePointerEvent('pointerup', 100, 60));
    button.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));

    expect(onClick).not.toHaveBeenCalled();
    document.body.removeChild(el);
  });

  test('a plain tap (no drag) still produces a click', () => {
    const el = makeScrollableDiv('scrollTop');
    const button = document.createElement('button');
    el.appendChild(button);
    const onClick = vi.fn();
    button.addEventListener('click', onClick);
    const { result } = renderHook(() => useTouchScroll({ axis: 'y' }));
    result.current(el);

    button.dispatchEvent(makePointerEvent('pointerdown', 100, 100));
    button.dispatchEvent(makePointerEvent('pointerup', 100, 100));
    button.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));

    expect(onClick).toHaveBeenCalledTimes(1);
    document.body.removeChild(el);
  });

  test('a click after a later, separate tap is not swallowed by an earlier drag', async () => {
    const el = makeScrollableDiv('scrollTop');
    const button = document.createElement('button');
    el.appendChild(button);
    const onClick = vi.fn();
    button.addEventListener('click', onClick);
    const { result } = renderHook(() => useTouchScroll({ axis: 'y' }));
    result.current(el);

    button.dispatchEvent(makePointerEvent('pointerdown', 100, 100));
    button.dispatchEvent(makePointerEvent('pointermove', 100, 60));
    button.dispatchEvent(makePointerEvent('pointerup', 100, 60));
    await new Promise((r) => setTimeout(r, 10)); // the drag's click never came; suppression must expire

    button.dispatchEvent(makePointerEvent('pointerdown', 100, 100));
    button.dispatchEvent(makePointerEvent('pointerup', 100, 100));
    button.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));

    expect(onClick).toHaveBeenCalledTimes(1);
    document.body.removeChild(el);
  });

  test('prevents text selection while a pointer is held down on the scroller', () => {
    const el = makeScrollableDiv('scrollTop');
    const { result } = renderHook(() => useTouchScroll({ axis: 'y' }));
    result.current(el);

    el.dispatchEvent(makePointerEvent('pointerdown', 100, 100));
    const selectStart = new Event('selectstart', { bubbles: true, cancelable: true });
    el.dispatchEvent(selectStart);

    expect(selectStart.defaultPrevented).toBe(true);
    document.body.removeChild(el);
  });

  test('detaches the pointer listeners when the ref is cleared', () => {
    const el = makeScrollableDiv('scrollTop');
    const { result } = renderHook(() => useTouchScroll({ axis: 'y' }));
    result.current(el);
    result.current(null);

    el.dispatchEvent(makePointerEvent('pointerdown', 100, 100));
    el.dispatchEvent(makePointerEvent('pointermove', 100, 50));

    expect(el.scrollTop).toBe(0);
    document.body.removeChild(el);
  });
});

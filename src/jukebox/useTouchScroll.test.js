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

// --- Momentum (inertial coast after release) --------------------------------
// requestAnimationFrame/performance.now are stubbed with a manually-driven
// clock and frame queue so the decay can be advanced deterministically,
// frame by frame, instead of depending on real timer resolution.
describe('momentum scrolling', () => {
  let now;
  let rafQueue; // array of {id, cb} — a real id is needed so the
                // cancelAnimationFrame stub can actually remove an entry,
                // the way a browser's would, rather than being a no-op.
  let nextRafId;

  beforeEach(() => {
    now = 0;
    rafQueue = [];
    nextRafId = 1;
    vi.stubGlobal('performance', { now: () => now });
    vi.stubGlobal('requestAnimationFrame', (cb) => {
      const id = nextRafId++;
      rafQueue.push({ id, cb });
      return id;
    });
    vi.stubGlobal('cancelAnimationFrame', (id) => {
      rafQueue = rafQueue.filter((entry) => entry.id !== id);
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  // Runs any frames currently queued (there's at most one in flight at a
  // time here, since each step only re-queues itself once it's done), then
  // advances the clock by `ms` before invoking them.
  const advanceFrame = (ms) => {
    now += ms;
    const queue = rafQueue;
    rafQueue = [];
    queue.forEach(({ cb }) => cb(now));
  };

  // Velocity needs two post-threshold samples (the window keeps whatever
  // landed within the last VELOCITY_WINDOW_MS), so a "fast release" drag
  // here is always two touchmoves close together in time.
  test('coasts after a fast release, decelerating each frame', () => {
    const el = makeScrollableDiv('scrollTop');
    const { result } = renderHook(() => useTouchScroll({ axis: 'y' }));
    result.current(el);

    el.dispatchEvent(makeTouchEvent('touchstart', 100, 300));
    now += 16;
    el.dispatchEvent(makeTouchEvent('touchmove', 100, 250)); // -50
    now += 16;
    el.dispatchEvent(makeTouchEvent('touchmove', 100, 200)); // -100 total, 50px in the last 16ms
    el.dispatchEvent(makeTouchEvent('touchend', 100, 200));

    expect(el.scrollTop).toBe(100); // the drag itself, before any coast
    expect(rafQueue.length).toBe(1); // momentum kicked off

    advanceFrame(16);
    const afterFirstCoastFrame = el.scrollTop;
    expect(afterFirstCoastFrame).toBeGreaterThan(100); // still coasting forward

    advanceFrame(16);
    const afterSecondCoastFrame = el.scrollTop;
    const firstStep = afterFirstCoastFrame - 100;
    const secondStep = afterSecondCoastFrame - afterFirstCoastFrame;
    expect(secondStep).toBeGreaterThan(0);
    expect(secondStep).toBeLessThan(firstStep); // decelerating
  });

  test('eventually stops coasting once velocity decays below the threshold', () => {
    const el = makeScrollableDiv('scrollTop');
    const { result } = renderHook(() => useTouchScroll({ axis: 'y' }));
    result.current(el);

    el.dispatchEvent(makeTouchEvent('touchstart', 100, 300));
    now += 16;
    el.dispatchEvent(makeTouchEvent('touchmove', 100, 250));
    now += 16;
    el.dispatchEvent(makeTouchEvent('touchmove', 100, 200));
    el.dispatchEvent(makeTouchEvent('touchend', 100, 200));

    // MOMENTUM_HALF_LIFE_MS is 325ms — this many frames covers well over the
    // ~8 half-lives an initial ~3px/ms release takes to decay past
    // STOP_VELOCITY (0.02), with comfortable margin.
    for (let i = 0; i < 300 && rafQueue.length > 0; i++) advanceFrame(16);

    expect(rafQueue.length).toBe(0); // stopped requesting further frames
  });

  test('does not coast after a slow release (below the fling threshold)', () => {
    const el = makeScrollableDiv('scrollTop');
    const { result } = renderHook(() => useTouchScroll({ axis: 'y' }));
    result.current(el);

    el.dispatchEvent(makeTouchEvent('touchstart', 100, 300));
    now += 250;
    el.dispatchEvent(makeTouchEvent('touchmove', 100, 290)); // crosses the drag threshold...
    now += 250;
    el.dispatchEvent(makeTouchEvent('touchmove', 100, 285)); // ...but only 5px in the last 250ms: 0.02px/ms
    el.dispatchEvent(makeTouchEvent('touchend', 100, 285));

    expect(rafQueue.length).toBe(0);
  });

  test('a plain tap (no drag) does not start a coast', () => {
    const el = makeScrollableDiv('scrollTop');
    const { result } = renderHook(() => useTouchScroll({ axis: 'y' }));
    result.current(el);

    el.dispatchEvent(makeTouchEvent('touchstart', 100, 300));
    el.dispatchEvent(makeTouchEvent('touchend', 100, 300));

    expect(rafQueue.length).toBe(0);
    expect(el.scrollTop).toBe(0);
  });

  test('a new touch immediately cancels an in-progress coast', () => {
    const el = makeScrollableDiv('scrollTop');
    const { result } = renderHook(() => useTouchScroll({ axis: 'y' }));
    result.current(el);

    el.dispatchEvent(makeTouchEvent('touchstart', 100, 300));
    now += 16;
    el.dispatchEvent(makeTouchEvent('touchmove', 100, 250));
    now += 16;
    el.dispatchEvent(makeTouchEvent('touchmove', 100, 200));
    el.dispatchEvent(makeTouchEvent('touchend', 100, 200));
    advanceFrame(16);
    const coasted = el.scrollTop;
    expect(coasted).toBeGreaterThan(100);

    el.dispatchEvent(makeTouchEvent('touchstart', 100, 200)); // grabs the content again
    const queuedAtGrab = rafQueue.length;

    // What matters is no *new* frame keeps the coast going once a fresh drag
    // has taken over — begin() cancels the in-flight animation synchronously.
    expect(queuedAtGrab).toBe(0);
    expect(el.scrollTop).toBe(coasted); // unchanged by the now-cancelled coast
  });

  test('coasting on the horizontal axis moves scrollLeft', () => {
    const el = makeScrollableDiv('scrollLeft');
    const { result } = renderHook(() => useTouchScroll({ axis: 'x' }));
    result.current(el);

    el.dispatchEvent(makeTouchEvent('touchstart', 300, 100));
    now += 16;
    el.dispatchEvent(makeTouchEvent('touchmove', 250, 100)); // dragged left -> scrolls right
    now += 16;
    el.dispatchEvent(makeTouchEvent('touchmove', 200, 100));
    el.dispatchEvent(makeTouchEvent('touchend', 200, 100));

    expect(rafQueue.length).toBe(1);
    advanceFrame(16);
    expect(el.scrollLeft).toBeGreaterThan(100);
  });

  test('momentum also coasts after a fast mouse-like pointer release', () => {
    const el = makeScrollableDiv('scrollTop');
    const { result } = renderHook(() => useTouchScroll({ axis: 'y' }));
    result.current(el);

    el.dispatchEvent(makePointerEvent('pointerdown', 100, 300));
    now += 16;
    el.dispatchEvent(makePointerEvent('pointermove', 100, 250));
    now += 16;
    el.dispatchEvent(makePointerEvent('pointermove', 100, 200));
    el.dispatchEvent(makePointerEvent('pointerup', 100, 200));

    expect(rafQueue.length).toBe(1);
    advanceFrame(16);
    expect(el.scrollTop).toBeGreaterThan(100);
  });

  test('stops coasting once the scroll position is clamped at a bound', () => {
    const el = document.createElement('div');
    let scrollTop = 0;
    const MAX_SCROLL = 105; // just past the drag's own 100px, so the coast clamps almost immediately
    Object.defineProperty(el, 'scrollTop', {
      get: () => scrollTop,
      set: (v) => { scrollTop = Math.max(0, Math.min(MAX_SCROLL, v)); },
    });
    document.body.appendChild(el);
    const { result } = renderHook(() => useTouchScroll({ axis: 'y' }));
    result.current(el);

    el.dispatchEvent(makeTouchEvent('touchstart', 100, 300));
    now += 16;
    el.dispatchEvent(makeTouchEvent('touchmove', 100, 250));
    now += 16;
    el.dispatchEvent(makeTouchEvent('touchmove', 100, 200));
    el.dispatchEvent(makeTouchEvent('touchend', 100, 200));
    expect(el.scrollTop).toBe(100);

    for (let i = 0; i < 10 && rafQueue.length > 0; i++) advanceFrame(16);

    expect(el.scrollTop).toBe(MAX_SCROLL);
    expect(rafQueue.length).toBe(0);
    document.body.removeChild(el);
  });
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

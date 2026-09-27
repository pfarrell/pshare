import { vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useSwipeToReveal, REVEAL_WIDTH_PX } from './useSwipeToReveal';

const makeTouchEvent = (type, x, y) => {
  const event = new Event(type, { bubbles: true, cancelable: true });
  Object.defineProperty(event, 'touches', { value: [{ clientX: x, clientY: y }], enumerable: true });
  Object.defineProperty(event, 'target', { value: event.target ?? document.body, enumerable: true, configurable: true });
  return event;
};

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

const makeRow = () => {
  const el = document.createElement('div');
  document.body.appendChild(el);
  return el;
};

const setup = (initialProps = { isOpen: false, disabled: false }) => {
  const onOpenChange = vi.fn();
  const { result, rerender } = renderHook(
    ({ isOpen, disabled }) => useSwipeToReveal({ isOpen, onOpenChange, disabled }),
    { initialProps }
  );
  return { result, rerender, onOpenChange };
};

afterEach(() => {
  document.body.innerHTML = '';
});

test('offset starts at 0 when closed', () => {
  const { result } = setup({ isOpen: false, disabled: false });
  expect(result.current.offset).toBe(0);
});

test('offset starts at the full reveal width when already open', () => {
  const { result } = setup({ isOpen: true, disabled: false });
  expect(result.current.offset).toBe(-REVEAL_WIDTH_PX);
});

test('does not reveal for movement under the drag threshold', () => {
  const { result } = setup();
  const el = makeRow();
  act(() => result.current.attachRef(el));

  act(() => {
    el.dispatchEvent(makeTouchEvent('touchstart', 100, 100));
    el.dispatchEvent(makeTouchEvent('touchmove', 97, 100)); // 3px, under the 6px threshold
  });

  expect(result.current.offset).toBe(0);
});

test('reveals proportionally to a leftward drag, clamped to the reveal width', () => {
  const { result } = setup();
  const el = makeRow();
  act(() => result.current.attachRef(el));

  act(() => {
    el.dispatchEvent(makeTouchEvent('touchstart', 100, 100));
    el.dispatchEvent(makeTouchEvent('touchmove', 60, 100)); // dragged left 40px
  });
  expect(result.current.offset).toBe(-40);

  act(() => { el.dispatchEvent(makeTouchEvent('touchmove', -100, 100)); }); // way past the reveal width
  expect(result.current.offset).toBe(-REVEAL_WIDTH_PX);
});

test('ignores a drag that is mostly vertical, leaving the row closed', () => {
  const { result } = setup();
  const el = makeRow();
  act(() => result.current.attachRef(el));

  act(() => {
    el.dispatchEvent(makeTouchEvent('touchstart', 100, 100));
    el.dispatchEvent(makeTouchEvent('touchmove', 95, 130)); // dx=5, dy=30 — mostly vertical
  });

  expect(result.current.offset).toBe(0);
});

test('snaps open and reports it once released past the halfway threshold', () => {
  const { result, rerender, onOpenChange } = setup();
  const el = makeRow();
  act(() => result.current.attachRef(el));

  act(() => {
    el.dispatchEvent(makeTouchEvent('touchstart', 100, 100));
    el.dispatchEvent(makeTouchEvent('touchmove', 40, 100)); // 60px, past REVEAL_WIDTH_PX/2 (36)
    el.dispatchEvent(makeTouchEvent('touchend', 40, 100));
  });

  expect(onOpenChange).toHaveBeenCalledWith(true);
  rerender({ isOpen: true, disabled: false });
  expect(result.current.offset).toBe(-REVEAL_WIDTH_PX);
});

test('snaps closed and reports it when released before the halfway threshold', () => {
  const { result, onOpenChange } = setup();
  const el = makeRow();
  act(() => result.current.attachRef(el));

  act(() => {
    el.dispatchEvent(makeTouchEvent('touchstart', 100, 100));
    el.dispatchEvent(makeTouchEvent('touchmove', 80, 100)); // 20px, under the halfway threshold
    el.dispatchEvent(makeTouchEvent('touchend', 80, 100));
  });

  expect(onOpenChange).toHaveBeenCalledWith(false);
  expect(result.current.offset).toBe(0);
});

test('an already-open row can be dragged back closed', () => {
  const { result } = setup({ isOpen: true, disabled: false });
  const el = makeRow();
  act(() => result.current.attachRef(el));

  act(() => {
    el.dispatchEvent(makeTouchEvent('touchstart', 100, 100));
    el.dispatchEvent(makeTouchEvent('touchmove', 130, 100)); // dragged right 30px, back toward closed
  });

  expect(result.current.offset).toBe(-REVEAL_WIDTH_PX + 30);
});

test('a plain tap on an open row (not the delete button) reports closed, and does not fire a click', () => {
  const { result, onOpenChange } = setup({ isOpen: true, disabled: false });
  const el = makeRow();
  act(() => result.current.attachRef(el));
  const onClick = vi.fn();
  el.addEventListener('click', onClick);

  act(() => {
    el.dispatchEvent(makeTouchEvent('touchstart', 100, 100));
    const endEvent = makeTouchEvent('touchend', 100, 100);
    el.dispatchEvent(endEvent);
  });

  expect(onOpenChange).toHaveBeenCalledWith(false);
});

test('a tap on the delete button does not report closed — its own click handles removal', () => {
  const { result, onOpenChange } = setup({ isOpen: true, disabled: false });
  const el = makeRow();
  const deleteButton = document.createElement('button');
  deleteButton.className = 'jukebox-queue-row-delete';
  el.appendChild(deleteButton);
  act(() => result.current.attachRef(el));

  act(() => {
    const startEvent = makeTouchEvent('touchstart', 100, 100);
    Object.defineProperty(startEvent, 'target', { value: deleteButton, configurable: true });
    el.dispatchEvent(startEvent);
    const endEvent = makeTouchEvent('touchend', 100, 100);
    Object.defineProperty(endEvent, 'target', { value: deleteButton, configurable: true });
    el.dispatchEvent(endEvent);
  });

  expect(onOpenChange).not.toHaveBeenCalled();
});

test('a plain tap on a closed row never calls onOpenChange', () => {
  const { result, onOpenChange } = setup({ isOpen: false, disabled: false });
  const el = makeRow();
  act(() => result.current.attachRef(el));

  act(() => {
    el.dispatchEvent(makeTouchEvent('touchstart', 100, 100));
    el.dispatchEvent(makeTouchEvent('touchend', 100, 100));
  });

  expect(onOpenChange).not.toHaveBeenCalled();
});

test('disabled rows ignore drags entirely', () => {
  const { result, onOpenChange } = setup({ isOpen: false, disabled: true });
  const el = makeRow();
  act(() => result.current.attachRef(el));

  act(() => {
    el.dispatchEvent(makeTouchEvent('touchstart', 100, 100));
    el.dispatchEvent(makeTouchEvent('touchmove', 20, 100)); // 80px left, would normally open it
    el.dispatchEvent(makeTouchEvent('touchend', 20, 100));
  });

  expect(result.current.offset).toBe(0);
  expect(onOpenChange).not.toHaveBeenCalled();
});

describe('mouse-like pointer input (kiosk touchscreen)', () => {
  test('dragging with a mouse-like pointer reveals the row', () => {
    const { result } = setup();
    const el = makeRow();
    act(() => result.current.attachRef(el));

    act(() => {
      el.dispatchEvent(makePointerEvent('pointerdown', 100, 100));
      el.dispatchEvent(makePointerEvent('pointermove', 60, 100));
    });

    expect(result.current.offset).toBe(-40);
  });

  test('ignores touch-type pointers (real touch events already handle those)', () => {
    const { result } = setup();
    const el = makeRow();
    act(() => result.current.attachRef(el));

    act(() => {
      el.dispatchEvent(makePointerEvent('pointerdown', 100, 100, { pointerType: 'touch' }));
      el.dispatchEvent(makePointerEvent('pointermove', 40, 100, { pointerType: 'touch' }));
    });

    expect(result.current.offset).toBe(0);
  });

  test('suppresses the click that follows a drag-release, so it cannot activate the track underneath', () => {
    const { result } = setup();
    const el = makeRow();
    act(() => result.current.attachRef(el));
    const onClick = vi.fn();
    el.addEventListener('click', onClick);

    act(() => {
      el.dispatchEvent(makePointerEvent('pointerdown', 100, 100));
      el.dispatchEvent(makePointerEvent('pointermove', 40, 100));
      el.dispatchEvent(makePointerEvent('pointerup', 40, 100));
      el.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
    });

    expect(onClick).not.toHaveBeenCalled();
  });

  test('a plain tap on a closed row via pointer still produces a click (normal tap-to-play)', () => {
    const { result } = setup({ isOpen: false, disabled: false });
    const el = makeRow();
    act(() => result.current.attachRef(el));
    const onClick = vi.fn();
    el.addEventListener('click', onClick);

    act(() => {
      el.dispatchEvent(makePointerEvent('pointerdown', 100, 100));
      el.dispatchEvent(makePointerEvent('pointerup', 100, 100));
      el.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
    });

    expect(onClick).toHaveBeenCalledTimes(1);
  });

  test('a tap that closes an open row via pointer also suppresses the click', () => {
    const { result, onOpenChange } = setup({ isOpen: true, disabled: false });
    const el = makeRow();
    act(() => result.current.attachRef(el));
    const onClick = vi.fn();
    el.addEventListener('click', onClick);

    act(() => {
      el.dispatchEvent(makePointerEvent('pointerdown', 100, 100));
      el.dispatchEvent(makePointerEvent('pointerup', 100, 100));
      el.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
    });

    expect(onOpenChange).toHaveBeenCalledWith(false);
    expect(onClick).not.toHaveBeenCalled();
  });
});

test('detaches listeners when the ref is cleared', () => {
  const { result, onOpenChange } = setup({ isOpen: true, disabled: false });
  const el = makeRow();
  act(() => result.current.attachRef(el));
  act(() => result.current.attachRef(null));

  act(() => {
    el.dispatchEvent(makeTouchEvent('touchstart', 100, 100));
    el.dispatchEvent(makeTouchEvent('touchend', 100, 100));
  });

  expect(onOpenChange).not.toHaveBeenCalled();
});

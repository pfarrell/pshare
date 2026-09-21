import { renderHook, act } from '@testing-library/react';
import { useJukeboxKeyboardFocus } from './useJukeboxKeyboardFocus';

const dispatchFocusEvent = (type, target) => {
  const event = new Event(type, { bubbles: true });
  Object.defineProperty(event, 'target', { value: target, enumerable: true });
  document.dispatchEvent(event);
};

test('tracks a focused text input and clears it on focusout', () => {
  const input = document.createElement('input');
  document.body.appendChild(input);
  const { result } = renderHook(() => useJukeboxKeyboardFocus());
  expect(result.current).toBeNull();

  act(() => { dispatchFocusEvent('focusin', input); });
  expect(result.current).toBe(input);

  act(() => { dispatchFocusEvent('focusout', input); });
  expect(result.current).toBeNull();

  document.body.removeChild(input);
});

test('ignores focus on non-text elements', () => {
  const button = document.createElement('button');
  document.body.appendChild(button);
  const { result } = renderHook(() => useJukeboxKeyboardFocus());

  act(() => { dispatchFocusEvent('focusin', button); });
  expect(result.current).toBeNull();

  document.body.removeChild(button);
});

test('a focusout on something other than the tracked element does not clear it', () => {
  const input = document.createElement('input');
  const other = document.createElement('div');
  document.body.appendChild(input);
  document.body.appendChild(other);
  const { result } = renderHook(() => useJukeboxKeyboardFocus());

  act(() => { dispatchFocusEvent('focusin', input); });
  expect(result.current).toBe(input);

  act(() => { dispatchFocusEvent('focusout', other); });
  expect(result.current).toBe(input);

  document.body.removeChild(input);
  document.body.removeChild(other);
});

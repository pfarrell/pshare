import { renderHook, act } from '@testing-library/react';
import { useRowHoverTooltip } from './useRowHoverTooltip';

const enter = (x, y) => ({ clientX: x, clientY: y });

test('starts with no tooltip', () => {
  const { result } = renderHook(() => useRowHoverTooltip());
  expect(result.current.tooltip).toBeNull();
});

test('does not show the tooltip before the delay elapses', () => {
  vi.useFakeTimers();
  const { result } = renderHook(() => useRowHoverTooltip({ delay: 500 }));
  const track = { id: 1 };
  act(() => { result.current.getRowHoverProps(track).onMouseEnter(enter(10, 20)); });
  act(() => { vi.advanceTimersByTime(499); });
  expect(result.current.tooltip).toBeNull();
  vi.useRealTimers();
});

test('shows the tooltip for the hovered track at the cursor position once the delay elapses', () => {
  vi.useFakeTimers();
  const { result } = renderHook(() => useRowHoverTooltip({ delay: 500 }));
  const track = { id: 1, title: 'Some Track' };
  act(() => { result.current.getRowHoverProps(track).onMouseEnter(enter(10, 20)); });
  act(() => { vi.advanceTimersByTime(500); });
  expect(result.current.tooltip).toEqual({ track, x: 10, y: 20 });
  vi.useRealTimers();
});

test('leaving before the delay elapses cancels the tooltip', () => {
  vi.useFakeTimers();
  const { result } = renderHook(() => useRowHoverTooltip({ delay: 500 }));
  const track = { id: 1 };
  const hoverProps = result.current.getRowHoverProps(track);
  act(() => { hoverProps.onMouseEnter(enter(10, 20)); });
  act(() => { vi.advanceTimersByTime(200); });
  act(() => { hoverProps.onMouseLeave(); });
  act(() => { vi.advanceTimersByTime(500); });
  expect(result.current.tooltip).toBeNull();
  vi.useRealTimers();
});

test('moving the mouse before the delay elapses does not reset the timer, and the tooltip appears at the latest position', () => {
  vi.useFakeTimers();
  const { result } = renderHook(() => useRowHoverTooltip({ delay: 500 }));
  const track = { id: 1 };
  const hoverProps = result.current.getRowHoverProps(track);
  act(() => { hoverProps.onMouseEnter(enter(10, 20)); });
  act(() => { vi.advanceTimersByTime(300); });
  act(() => { hoverProps.onMouseMove(enter(50, 60)); });
  act(() => { vi.advanceTimersByTime(200); });
  expect(result.current.tooltip).toEqual({ track, x: 50, y: 60 });
  vi.useRealTimers();
});

test('moving the mouse after the tooltip is shown keeps it following the cursor', () => {
  vi.useFakeTimers();
  const { result } = renderHook(() => useRowHoverTooltip({ delay: 500 }));
  const track = { id: 1 };
  const hoverProps = result.current.getRowHoverProps(track);
  act(() => { hoverProps.onMouseEnter(enter(10, 20)); });
  act(() => { vi.advanceTimersByTime(500); });
  act(() => { hoverProps.onMouseMove(enter(70, 80)); });
  expect(result.current.tooltip).toEqual({ track, x: 70, y: 80 });
  vi.useRealTimers();
});

test('leaving after the tooltip is shown hides it', () => {
  vi.useFakeTimers();
  const { result } = renderHook(() => useRowHoverTooltip({ delay: 500 }));
  const track = { id: 1 };
  const hoverProps = result.current.getRowHoverProps(track);
  act(() => { hoverProps.onMouseEnter(enter(10, 20)); });
  act(() => { vi.advanceTimersByTime(500); });
  act(() => { hoverProps.onMouseLeave(); });
  expect(result.current.tooltip).toBeNull();
  vi.useRealTimers();
});

test('when disabled, getRowHoverProps returns no handlers', () => {
  const { result } = renderHook(() => useRowHoverTooltip({ disabled: true }));
  expect(result.current.getRowHoverProps({ id: 1 })).toEqual({});
});

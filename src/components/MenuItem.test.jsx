import { fireEvent, render, screen } from '@testing-library/react';
import MenuItem from './MenuItem';

describe('MenuItem', () => {
  test('click selects without bubbling to the row behind the portal', () => {
    const onSelect = vi.fn();
    const rowClick = vi.fn();
    render(<div onClick={rowClick}><MenuItem onSelect={onSelect}>✎ Edit</MenuItem></div>);
    fireEvent.click(screen.getByText('✎ Edit'));
    expect(onSelect).toHaveBeenCalledTimes(1);
    expect(rowClick).not.toHaveBeenCalled();
  });

  test('touchend selects, prevents the ghost click, and stops propagation', () => {
    const onSelect = vi.fn();
    const rowTouchEnd = vi.fn();
    render(<div onTouchEnd={rowTouchEnd}><MenuItem onSelect={onSelect}>✎ Edit</MenuItem></div>);
    const notPrevented = fireEvent.touchEnd(screen.getByText('✎ Edit'));
    expect(onSelect).toHaveBeenCalledTimes(1);
    expect(notPrevented).toBe(false);
    expect(rowTouchEnd).not.toHaveBeenCalled();
  });

  test('touchstart does not reach the row (would restart its long-press timer)', () => {
    const rowTouchStart = vi.fn();
    render(<div onTouchStart={rowTouchStart}><MenuItem onSelect={vi.fn()}>x</MenuItem></div>);
    fireEvent.touchStart(screen.getByText('x'));
    expect(rowTouchStart).not.toHaveBeenCalled();
  });
});

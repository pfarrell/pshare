import { act, fireEvent, render, screen } from '@testing-library/react';
import ReorderableList from './ReorderableList';

const renderList = (onReorder) => render(
  <ReorderableList
    items={['a', 'b', 'c']}
    getKey={(x) => x}
    onReorder={onReorder}
    renderRow={(x) => <><span>{x}</span><button>Remove {x}</button></>}
    menuTestId="list-menu-backdrop"
  />
);

const row = (text) => screen.getByText(text).closest('[draggable]');

describe('ReorderableList', () => {
  test('right-click opens Send to Top/Bottom; Send to Top reorders', () => {
    const onReorder = vi.fn();
    renderList(onReorder);
    fireEvent.contextMenu(row('c'));
    fireEvent.click(screen.getByText('⬆ Send to Top'));
    expect(onReorder).toHaveBeenCalledWith(['c', 'a', 'b']);
  });

  test('right-click on a row button does not open the menu', () => {
    renderList(vi.fn());
    fireEvent.contextMenu(screen.getByText('Remove b'));
    expect(screen.queryByText('⬆ Send to Top')).not.toBeInTheDocument();
  });

  test('long-press opens the menu', () => {
    renderList(vi.fn());
    vi.useFakeTimers();
    try {
      fireEvent.touchStart(row('a'), { touches: [{ clientX: 50, clientY: 50 }] });
      act(() => { vi.advanceTimersByTime(500); });
      expect(screen.getByText('⬇ Send to Bottom')).toBeInTheDocument();
    } finally {
      vi.useRealTimers();
    }
  });

  test('dropping on the top half of a row inserts before it and shows the indicator while hovering', () => {
    const onReorder = vi.fn();
    renderList(onReorder);
    const target = row('a');
    vi.spyOn(target, 'getBoundingClientRect').mockReturnValue({ top: 0, bottom: 40, height: 40, left: 0, right: 100, width: 100 });
    const dataTransfer = { effectAllowed: '', dropEffect: '' };
    fireEvent.dragStart(row('c'), { dataTransfer });
    fireEvent.dragOver(target, { dataTransfer, clientY: 5 });
    expect(screen.getByTestId('drop-indicator')).toBeInTheDocument();
    fireEvent.drop(target, { dataTransfer, clientY: 5 });
    expect(onReorder).toHaveBeenCalledWith(['c', 'a', 'b']);
  });
});

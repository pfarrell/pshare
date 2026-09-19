import { render, screen, fireEvent, act } from '@testing-library/react';
import ContextMenu from './ContextMenu';

test('falsy children do not inflate the height calculation', () => {
  // Verify that Children.toArray().filter(Boolean) is being used instead of
  // Children.count(), which would incorrectly count falsy children (like the
  // result of `isAuthenticated && <button>` when false).
  render(
    <ContextMenu
      open={true}
      position={{ x: 10, y: 10 }}
      onDismiss={vi.fn()}
      onSwallowTouch={vi.fn()}
    >
      <button key="a">Button A</button>
      {false}
      <button key="b">Button B</button>
      {null}
      <button key="c">Button C</button>
      {undefined}
    </ContextMenu>
  );

  // Component portals to document.body, find the menu there
  const menu = document.querySelector('.track-dropdown');
  expect(menu).toBeInTheDocument();

  // Verify only 3 buttons rendered (not 6 with falsy children counted)
  const buttons = menu.querySelectorAll('button');
  expect(buttons).toHaveLength(3);
});

test('menu clamps left position to stay on-screen', () => {
  Object.defineProperty(window, 'innerWidth', { value: 1024, configurable: true });
  Object.defineProperty(window, 'innerHeight', { value: 768, configurable: true });

  render(
    <ContextMenu
      open={true}
      position={{ x: 900, y: 100 }}
      onDismiss={vi.fn()}
      onSwallowTouch={vi.fn()}
    >
      <button key="a">A</button>
      <button key="b">B</button>
    </ContextMenu>
  );

  const menu = document.querySelector('.track-dropdown');
  const style = window.getComputedStyle(menu);
  const left = parseInt(style.left);

  // Menu should be clamped when it would exceed window width
  // 900 + 240 (MENU_WIDTH) = 1140 > 1024, so left should be 1024 - 240 - 10 = 774
  expect(left).toBe(774);
});

test('renders null when open is false', () => {
  render(
    <ContextMenu
      open={false}
      position={{ x: 10, y: 10 }}
      onDismiss={vi.fn()}
      onSwallowTouch={vi.fn()}
    >
      <button>Button</button>
    </ContextMenu>
  );

  // When open is false, component returns null and doesn't render anything to document.body
  expect(document.querySelector('.track-dropdown')).not.toBeInTheDocument();
});

describe('early-tap guard on touch-opened menus', () => {
  test('swallows a click landing on an item immediately after a touch-opened menu appears', () => {
    vi.useFakeTimers();
    const onClick = vi.fn();
    render(
      <ContextMenu
        open={true}
        position={{ x: 10, y: 10 }}
        openedViaTouch={true}
        onDismiss={vi.fn()}
        onSwallowTouch={vi.fn()}
      >
        <button onClick={onClick}>Play Now</button>
      </ContextMenu>
    );

    fireEvent.click(screen.getByText('Play Now'));

    expect(onClick).not.toHaveBeenCalled();
    vi.useRealTimers();
  });

  test('lets the click through once the guard window has elapsed', () => {
    vi.useFakeTimers();
    const onClick = vi.fn();
    render(
      <ContextMenu
        open={true}
        position={{ x: 10, y: 10 }}
        openedViaTouch={true}
        onDismiss={vi.fn()}
        onSwallowTouch={vi.fn()}
      >
        <button onClick={onClick}>Play Now</button>
      </ContextMenu>
    );

    act(() => { vi.advanceTimersByTime(350); });
    fireEvent.click(screen.getByText('Play Now'));

    expect(onClick).toHaveBeenCalledTimes(1);
    vi.useRealTimers();
  });

  test('does not guard a desktop right-click open — the immediate follow-up click works normally', () => {
    const onClick = vi.fn();
    render(
      <ContextMenu
        open={true}
        position={{ x: 10, y: 10 }}
        openedViaTouch={false}
        onDismiss={vi.fn()}
        onSwallowTouch={vi.fn()}
      >
        <button onClick={onClick}>Play Now</button>
      </ContextMenu>
    );

    fireEvent.click(screen.getByText('Play Now'));

    expect(onClick).toHaveBeenCalledTimes(1);
  });
});

test('uses custom testId on backdrop', () => {
  render(
    <ContextMenu
      open={true}
      position={{ x: 10, y: 10 }}
      onDismiss={vi.fn()}
      onSwallowTouch={vi.fn()}
      testId="my-custom-backdrop"
    >
      <button>Button</button>
    </ContextMenu>
  );

  expect(screen.getByTestId('my-custom-backdrop')).toBeInTheDocument();
});

describe('ContextMenu — actions prop', () => {
  const baseProps = { open: true, position: { x: 10, y: 10 }, onDismiss: vi.fn(), onSwallowTouch: vi.fn() };

  test('renders one item per truthy action, as "icon label"', () => {
    render(
      <ContextMenu
        {...baseProps}
        actions={[
          { key: 'edit', icon: '✎', label: 'Edit', onClick: vi.fn() },
          false,
          null,
          { key: 'share', icon: '📤', label: 'Share', onClick: vi.fn() },
        ]}
      />
    );
    expect(screen.getByText('✎ Edit')).toBeInTheDocument();
    expect(screen.getByText('📤 Share')).toBeInTheDocument();
    expect(screen.getAllByRole('button')).toHaveLength(2);
  });

  test('selecting an action calls onClose before onClick', () => {
    const calls = [];
    render(
      <ContextMenu
        {...baseProps}
        onClose={() => calls.push('close')}
        actions={[{ key: 'edit', icon: '✎', label: 'Edit', onClick: () => calls.push('edit') }]}
      />
    );
    fireEvent.click(screen.getByText('✎ Edit'));
    expect(calls).toEqual(['close', 'edit']);
  });

  test('without onClose, only onClick runs', () => {
    const onClick = vi.fn();
    render(<ContextMenu {...baseProps} actions={[{ key: 'a', icon: 'A', label: 'Alpha', onClick, className: 'menu-btn-pressed' }]} />);
    fireEvent.click(screen.getByText('A Alpha'));
    expect(onClick).toHaveBeenCalledTimes(1);
    expect(screen.getByText('A Alpha')).toHaveClass('menu-btn-pressed');
  });
});

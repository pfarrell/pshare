import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { vi, describe, test, expect } from 'vitest';
import PlayActionsMenu from './PlayActionsMenu';

describe('PlayActionsMenu', () => {
  test('renders a Play button that calls onPlay', async () => {
    const onPlay = vi.fn();
    const user = userEvent.setup();
    render(<PlayActionsMenu onPlay={onPlay} onPlayNext={vi.fn()} onAddToQueue={vi.fn()} />);

    await user.click(screen.getByRole('button', { name: 'Play' }));

    expect(onPlay).toHaveBeenCalledTimes(1);
  });

  test('omits the Play button when onPlay is not provided', () => {
    render(<PlayActionsMenu onPlayNext={vi.fn()} onAddToQueue={vi.fn()} />);
    expect(screen.queryByRole('button', { name: 'Play' })).not.toBeInTheDocument();
  });

  test('renders Play alone (no toggle) when there is nothing to put in a menu', () => {
    render(<PlayActionsMenu onPlay={vi.fn()} />);
    expect(screen.getByRole('button', { name: 'Play' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'More options' })).not.toBeInTheDocument();
  });

  test('renders just the toggle (no Play) when onPlay is absent but menu items exist', () => {
    render(<PlayActionsMenu overflowActions={[{ key: 'share', icon: '📤', label: 'Share', onClick: vi.fn() }]} />);
    expect(screen.queryByRole('button', { name: 'Play' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'More options' })).toBeInTheDocument();
  });

  test('renders nothing at all when there is no Play and no menu items', () => {
    const { container } = render(<PlayActionsMenu />);
    expect(container.querySelector('.play-actions-bar')).toBeEmptyDOMElement();
  });

  test('the toggle opens one combined menu with Play Next, Add to Queue, and overflow actions in that order', async () => {
    const user = userEvent.setup();
    render(
      <PlayActionsMenu
        onPlay={vi.fn()}
        onPlayNext={vi.fn()}
        onAddToQueue={vi.fn()}
        overflowActions={[{ key: 'edit', icon: '✎', label: 'Edit', onClick: vi.fn() }]}
      />
    );

    await user.click(screen.getByRole('button', { name: 'More options' }));

    const dropdown = screen.getByRole('button', { name: '⏭ Play Next' }).closest('.track-dropdown');
    const labels = Array.from(dropdown.querySelectorAll('button')).map((b) => b.textContent);
    expect(labels).toEqual(['⏭ Play Next', '➕ Add to Queue', '✎ Edit']);
  });

  test('clicking Play Next in the menu calls onPlayNext and closes the menu', async () => {
    const onPlayNext = vi.fn();
    const user = userEvent.setup();
    render(<PlayActionsMenu onPlay={vi.fn()} onPlayNext={onPlayNext} onAddToQueue={vi.fn()} />);

    await user.click(screen.getByRole('button', { name: 'More options' }));
    await user.click(screen.getByRole('button', { name: '⏭ Play Next' }));

    expect(onPlayNext).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole('button', { name: '⏭ Play Next' })).not.toBeInTheDocument();
  });

  test('clicking Add to Queue in the menu calls onAddToQueue and closes the menu', async () => {
    const onAddToQueue = vi.fn();
    const user = userEvent.setup();
    render(<PlayActionsMenu onPlay={vi.fn()} onPlayNext={vi.fn()} onAddToQueue={onAddToQueue} />);

    await user.click(screen.getByRole('button', { name: 'More options' }));
    await user.click(screen.getByRole('button', { name: '➕ Add to Queue' }));

    expect(onAddToQueue).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole('button', { name: '➕ Add to Queue' })).not.toBeInTheDocument();
  });

  test('clicking an overflow action calls its onClick and closes the menu', async () => {
    const onEdit = vi.fn();
    const onShare = vi.fn();
    const user = userEvent.setup();
    render(
      <PlayActionsMenu
        onPlay={vi.fn()}
        overflowActions={[
          { key: 'edit', icon: '✎', label: 'Edit', onClick: onEdit },
          { key: 'share', icon: '📤', label: 'Share', onClick: onShare },
        ]}
      />
    );

    await user.click(screen.getByRole('button', { name: 'More options' }));
    expect(screen.getByRole('button', { name: '✎ Edit' })).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: '📤 Share' }));

    expect(onShare).toHaveBeenCalledTimes(1);
    expect(onEdit).not.toHaveBeenCalled();
    expect(screen.queryByRole('button', { name: '📤 Share' })).not.toBeInTheDocument();
  });

  test('clicking the backdrop closes the menu without calling any handler', async () => {
    const onPlayNext = vi.fn();
    const onAddToQueue = vi.fn();
    const user = userEvent.setup();
    render(<PlayActionsMenu onPlay={vi.fn()} onPlayNext={onPlayNext} onAddToQueue={onAddToQueue} />);

    await user.click(screen.getByRole('button', { name: 'More options' }));
    expect(screen.getByRole('button', { name: '⏭ Play Next' })).toBeInTheDocument();

    await user.click(screen.getByTestId('play-actions-menu-backdrop'));

    expect(screen.queryByRole('button', { name: '⏭ Play Next' })).not.toBeInTheDocument();
    expect(onPlayNext).not.toHaveBeenCalled();
    expect(onAddToQueue).not.toHaveBeenCalled();
  });

  test('disabled disables both halves of the split button', () => {
    render(<PlayActionsMenu onPlay={vi.fn()} onPlayNext={vi.fn()} disabled />);

    expect(screen.getByRole('button', { name: 'Play' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'More options' })).toBeDisabled();
  });

  test('clamps dropdown menu to viewport bounds when toggle button is near right edge', async () => {
    const user = userEvent.setup();
    render(
      <PlayActionsMenu onPlay={vi.fn()} onPlayNext={vi.fn()} onAddToQueue={vi.fn()} />
    );

    // Save original values for restoration
    const originalInnerWidth = window.innerWidth;

    // Mock a narrow viewport (375px typical phone width)
    Object.defineProperty(window, 'innerWidth', {
      writable: true,
      configurable: true,
      value: 375,
    });

    // Find the toggle button (▾) and mock its getBoundingClientRect
    const toggleButton = screen.getByRole('button', { name: 'More options' });
    const originalGetBoundingClientRect = Element.prototype.getBoundingClientRect;
    Element.prototype.getBoundingClientRect = vi.fn(function() {
      // If this is the toggle button, return a rect positioned near the right edge
      if (this === toggleButton) {
        return {
          top: 100,
          left: 300, // Near right edge of 375px viewport
          bottom: 150,
          right: 350,
          width: 50,
          height: 50,
          x: 300,
          y: 100,
        };
      }
      // For other elements, use the original implementation
      return originalGetBoundingClientRect.call(this);
    });

    // Open the menu
    await user.click(toggleButton);

    // Get the dropdown menu container
    const dropdownMenu = screen.getByRole('button', { name: '⏭ Play Next' }).closest('.track-dropdown');
    const computedStyle = window.getComputedStyle(dropdownMenu);
    const left = parseInt(computedStyle.left, 10);

    // Menu should be clamped: left + 200 (menuWidth) <= 375 - 10 (margin)
    // So left should be <= 165
    expect(left).toBeLessThanOrEqual(165);

    // Restore original values
    Element.prototype.getBoundingClientRect = originalGetBoundingClientRect;
    Object.defineProperty(window, 'innerWidth', {
      writable: true,
      configurable: true,
      value: originalInnerWidth,
    });
  });
});

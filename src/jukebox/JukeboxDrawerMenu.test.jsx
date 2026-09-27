import { render, screen, fireEvent } from '@testing-library/react';
import { vi } from 'vitest';
import JukeboxDrawerMenu from './JukeboxDrawerMenu';

const renderMenu = (props = {}) =>
  render(<JukeboxDrawerMenu activeDestination="browse" onSelectDestination={vi.fn()} {...props} />);

test('starts closed, opens on tapping the menu icon', () => {
  renderMenu();
  expect(screen.queryByRole('button', { name: 'Next Up' })).not.toBeInTheDocument();

  fireEvent.click(screen.getByRole('button', { name: /drawer menu/i }));

  expect(screen.getByRole('button', { name: 'Next Up' })).toBeInTheDocument();
});

test('lists only the two destinations that are not currently active', () => {
  renderMenu({ activeDestination: 'browse' });
  fireEvent.click(screen.getByRole('button', { name: /drawer menu/i }));

  expect(screen.getByRole('button', { name: 'Next Up' })).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Settings' })).toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'Browse' })).not.toBeInTheDocument();
});

test('shows Browse and Settings when Next Up is active', () => {
  renderMenu({ activeDestination: 'nextup' });
  fireEvent.click(screen.getByRole('button', { name: /drawer menu/i }));

  expect(screen.getByRole('button', { name: 'Browse' })).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Settings' })).toBeInTheDocument();
});

test('selecting a destination reports it and closes the menu', () => {
  const onSelectDestination = vi.fn();
  renderMenu({ activeDestination: 'browse', onSelectDestination });
  fireEvent.click(screen.getByRole('button', { name: /drawer menu/i }));

  fireEvent.click(screen.getByRole('button', { name: 'Next Up' }));

  expect(onSelectDestination).toHaveBeenCalledWith('nextup');
  expect(screen.queryByRole('button', { name: 'Settings' })).not.toBeInTheDocument();
});

test('tapping the icon again while open closes the menu', () => {
  renderMenu();
  const icon = screen.getByRole('button', { name: /drawer menu/i });
  fireEvent.click(icon);
  expect(screen.getByRole('button', { name: 'Next Up' })).toBeInTheDocument();

  fireEvent.click(icon);

  expect(screen.queryByRole('button', { name: 'Next Up' })).not.toBeInTheDocument();
});

test('a pointerdown anywhere outside the menu closes it', () => {
  render(
    <div>
      <div data-testid="outside">Elsewhere</div>
      <JukeboxDrawerMenu activeDestination="browse" onSelectDestination={vi.fn()} />
    </div>
  );
  fireEvent.click(screen.getByRole('button', { name: /drawer menu/i }));
  expect(screen.getByRole('button', { name: 'Next Up' })).toBeInTheDocument();

  fireEvent.pointerDown(screen.getByTestId('outside'));

  expect(screen.queryByRole('button', { name: 'Next Up' })).not.toBeInTheDocument();
});

import { render, screen, fireEvent } from '@testing-library/react';
import { vi } from 'vitest';
import QuickHitAlbumTile from './QuickHitAlbumTile';

const album = { id: 7, title: 'Album One', artist: { id: 3, name: 'Artist One' } };

test('renders cover, title and artist inside a single button', () => {
  render(<QuickHitAlbumTile album={album} imageUrl="/img/a.jpg" onSelect={vi.fn()} />);

  const button = screen.getByRole('button', { name: /Album One/ });
  expect(button).toHaveTextContent('Artist One');
  expect(button.querySelector('img')).toHaveAttribute('src', '/img/a.jpg');
});

test('tapping the tile calls onSelect with the album', () => {
  const onSelect = vi.fn();
  render(<QuickHitAlbumTile album={album} imageUrl="/img/a.jpg" onSelect={onSelect} />);

  fireEvent.click(screen.getByRole('button', { name: /Album One/ }));

  expect(onSelect).toHaveBeenCalledWith(album);
});

test('has exactly one interactive control — no play, menu or favorite buttons', () => {
  render(<QuickHitAlbumTile album={album} imageUrl="/img/a.jpg" onSelect={vi.fn()} />);

  expect(screen.getAllByRole('button')).toHaveLength(1);
});

test('renders without crashing when artist or image are missing', () => {
  render(<QuickHitAlbumTile album={{ id: 8, title: 'Orphan', artist: null }} imageUrl={null} onSelect={vi.fn()} />);

  const button = screen.getByRole('button', { name: /Orphan/ });
  expect(button.querySelector('img')).toBeNull();
  expect(button.querySelector('.jukebox-quick-hit-art-placeholder')).not.toBeNull();
});

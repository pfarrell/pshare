import { render, screen, fireEvent } from '@testing-library/react';
import { vi } from 'vitest';
import JukeboxCollectionTile from './JukeboxCollectionTile';

const collection = { id: 6, name: 'Sunday Morning', album_count: 5 };

test('renders cover, title and album count inside a single button', () => {
  render(<JukeboxCollectionTile collection={collection} imageUrl="/img/c.jpg" onSelect={vi.fn()} />);

  const button = screen.getByRole('button', { name: /Sunday Morning/ });
  expect(button).toHaveTextContent('5 albums');
  expect(button.querySelector('img')).toHaveAttribute('src', '/img/c.jpg');
});

test('uses the singular for one album', () => {
  render(<JukeboxCollectionTile collection={{ ...collection, album_count: 1 }} imageUrl="/img/c.jpg" onSelect={vi.fn()} />);
  expect(screen.getByRole('button')).toHaveTextContent('1 album');
  expect(screen.getByRole('button')).not.toHaveTextContent('1 albums');
});

test('tapping the tile calls onSelect with the collection', () => {
  const onSelect = vi.fn();
  render(<JukeboxCollectionTile collection={collection} imageUrl="/img/c.jpg" onSelect={onSelect} />);

  fireEvent.click(screen.getByRole('button', { name: /Sunday Morning/ }));

  expect(onSelect).toHaveBeenCalledWith(collection);
});

test('falls back to a placeholder when there is no image, or it fails to load', () => {
  const { rerender } = render(<JukeboxCollectionTile collection={collection} imageUrl={null} onSelect={vi.fn()} />);
  expect(screen.getByRole('button').querySelector('img')).toBeNull();
  expect(screen.getByRole('button').querySelector('.jukebox-album-tile-art-placeholder')).not.toBeNull();

  rerender(<JukeboxCollectionTile collection={collection} imageUrl="/img/missing.jpg" onSelect={vi.fn()} />);
  fireEvent.error(screen.getByRole('button').querySelector('img'));
  expect(screen.getByRole('button').querySelector('img')).toBeNull();
});

test('has exactly one interactive control — no play, menu or favorite buttons', () => {
  render(<JukeboxCollectionTile collection={collection} imageUrl="/img/c.jpg" onSelect={vi.fn()} />);
  expect(screen.getAllByRole('button')).toHaveLength(1);
});

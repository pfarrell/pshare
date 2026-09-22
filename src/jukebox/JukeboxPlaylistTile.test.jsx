import { render, screen, fireEvent } from '@testing-library/react';
import { vi } from 'vitest';
import JukeboxPlaylistTile from './JukeboxPlaylistTile';

const playlist = { id: 9, name: 'Road Trip', track_count: 14 };

test('renders cover, title and track count inside a single button', () => {
  render(<JukeboxPlaylistTile playlist={playlist} imageUrl="/img/p.jpg" onSelect={vi.fn()} />);

  const button = screen.getByRole('button', { name: /Road Trip/ });
  expect(button).toHaveTextContent('14 tracks');
  expect(button.querySelector('img')).toHaveAttribute('src', '/img/p.jpg');
});

test('uses the singular for one track', () => {
  render(<JukeboxPlaylistTile playlist={{ ...playlist, track_count: 1 }} imageUrl="/img/p.jpg" onSelect={vi.fn()} />);
  expect(screen.getByRole('button')).toHaveTextContent('1 track');
  expect(screen.getByRole('button')).not.toHaveTextContent('1 tracks');
});

test('tapping the tile calls onSelect with the playlist', () => {
  const onSelect = vi.fn();
  render(<JukeboxPlaylistTile playlist={playlist} imageUrl="/img/p.jpg" onSelect={onSelect} />);

  fireEvent.click(screen.getByRole('button', { name: /Road Trip/ }));

  expect(onSelect).toHaveBeenCalledWith(playlist);
});

test('falls back to a placeholder when there is no image, or it fails to load', () => {
  const { rerender } = render(<JukeboxPlaylistTile playlist={playlist} imageUrl={null} onSelect={vi.fn()} />);
  expect(screen.getByRole('button').querySelector('img')).toBeNull();
  expect(screen.getByRole('button').querySelector('.jukebox-album-tile-art-placeholder')).not.toBeNull();

  rerender(<JukeboxPlaylistTile playlist={playlist} imageUrl="/img/missing.jpg" onSelect={vi.fn()} />);
  fireEvent.error(screen.getByRole('button').querySelector('img'));
  expect(screen.getByRole('button').querySelector('img')).toBeNull();
});

test('has exactly one interactive control — no play, menu or favorite buttons', () => {
  render(<JukeboxPlaylistTile playlist={playlist} imageUrl="/img/p.jpg" onSelect={vi.fn()} />);
  expect(screen.getAllByRole('button')).toHaveLength(1);
});

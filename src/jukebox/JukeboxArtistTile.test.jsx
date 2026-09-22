import { render, screen, fireEvent } from '@testing-library/react';
import { vi } from 'vitest';
import JukeboxArtistTile from './JukeboxArtistTile';

const artist = { id: 4, name: 'Thelonious Monk', album_count: 17 };

test('renders a single button with the photo, name and album count', () => {
  render(<JukeboxArtistTile artist={artist} imageUrl="/img/t.jpg" onSelect={vi.fn()} />);

  const button = screen.getByRole('button', { name: /Thelonious Monk/ });
  expect(button).toHaveTextContent('17 albums');
  expect(button.querySelector('img')).toHaveAttribute('src', '/img/t.jpg');
  expect(screen.getAllByRole('button')).toHaveLength(1); // no play button or menu
});

test('tapping calls onSelect with the artist', () => {
  const onSelect = vi.fn();
  render(<JukeboxArtistTile artist={artist} imageUrl="/img/t.jpg" onSelect={onSelect} />);

  fireEvent.click(screen.getByRole('button', { name: /Thelonious Monk/ }));

  expect(onSelect).toHaveBeenCalledWith(artist);
});

test('uses the singular for one album, and hides the count when there are none', () => {
  const { rerender } = render(<JukeboxArtistTile artist={{ ...artist, album_count: 1 }} imageUrl="/i.jpg" onSelect={vi.fn()} />);
  expect(screen.getByRole('button')).toHaveTextContent('1 album');
  expect(screen.getByRole('button')).not.toHaveTextContent('1 albums');

  rerender(<JukeboxArtistTile artist={{ ...artist, album_count: 0 }} imageUrl="/i.jpg" onSelect={vi.fn()} />);
  expect(screen.getByRole('button')).not.toHaveTextContent(/album/);

  rerender(<JukeboxArtistTile artist={{ id: 9, name: 'No Count' }} imageUrl="/i.jpg" onSelect={vi.fn()} />);
  expect(screen.getByRole('button')).not.toHaveTextContent(/album/);
});

test('shows an initial placeholder when there is no image, or the image fails to load', () => {
  const { rerender } = render(<JukeboxArtistTile artist={artist} imageUrl={null} onSelect={vi.fn()} />);
  expect(screen.getByRole('button').querySelector('img')).toBeNull();
  expect(screen.getByRole('button').querySelector('.jukebox-artist-tile-art-placeholder')).toHaveTextContent('T');

  rerender(<JukeboxArtistTile artist={artist} imageUrl="/img/missing.jpg" onSelect={vi.fn()} />);
  fireEvent.error(screen.getByRole('button').querySelector('img'));
  expect(screen.getByRole('button').querySelector('img')).toBeNull();
  expect(screen.getByRole('button').querySelector('.jukebox-artist-tile-art-placeholder')).toHaveTextContent('T');
});

test('handles album_count arriving as a string (the search API returns one)', () => {
  const { rerender } = render(<JukeboxArtistTile artist={{ ...artist, album_count: '1' }} imageUrl="/i.jpg" onSelect={vi.fn()} />);
  expect(screen.getByRole('button')).toHaveTextContent('1 album');
  expect(screen.getByRole('button')).not.toHaveTextContent('1 albums');

  rerender(<JukeboxArtistTile artist={{ ...artist, album_count: '0' }} imageUrl="/i.jpg" onSelect={vi.fn()} />);
  expect(screen.getByRole('button')).not.toHaveTextContent(/album/);
});

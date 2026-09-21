import { render, screen, fireEvent } from '@testing-library/react';
import { vi } from 'vitest';
import JukeboxBrowsePanel from './JukeboxBrowsePanel';

vi.mock('./QuickHitTab', () => ({
  default: ({ onSelectAlbum }) => (
    <div data-testid="quick-hit-tab">
      <button onClick={() => onSelectAlbum({ id: 1, title: 'Quick Hit Album' })}>select-quickhit-album</button>
    </div>
  ),
}));
vi.mock('./SearchTab', () => ({
  default: ({ onSelectArtist, onSelectAlbum }) => (
    <div data-testid="search-tab">
      <button onClick={() => onSelectArtist({ id: 2, name: 'Search Artist' })}>select-search-artist</button>
      <button onClick={() => onSelectAlbum({ id: 3, title: 'Search Album' })}>select-search-album</button>
    </div>
  ),
}));
vi.mock('./JukeboxArtistView', () => ({
  default: ({ artist, onSelectAlbum, onBack }) => (
    <div data-testid="jukebox-artist-view">
      <span>artist-view: {artist.name}</span>
      <button onClick={() => onSelectAlbum({ id: 4, title: 'Album From Artist' })}>select-album-from-artist</button>
      <button onClick={onBack}>back-from-artist</button>
    </div>
  ),
}));
vi.mock('./JukeboxAlbumView', () => ({
  default: ({ album, onBack }) => (
    <div data-testid="jukebox-album-view">
      <span>album-view: {album.title}</span>
      <button onClick={onBack}>back-from-album</button>
    </div>
  ),
}));
vi.mock('./JukeboxNextUpTab', () => ({ default: () => <div data-testid="jukebox-next-up-tab" /> }));

test('renders the Quick Hit tab by default', () => {
  render(<JukeboxBrowsePanel onClose={vi.fn()} />);
  expect(screen.getByTestId('quick-hit-tab')).toBeInTheDocument();
});

test('calls onClose when the close button is tapped', () => {
  const onClose = vi.fn();
  render(<JukeboxBrowsePanel onClose={onClose} />);
  fireEvent.click(screen.getByRole('button', { name: 'Close' }));
  expect(onClose).toHaveBeenCalled();
});

test('switches to the Search tab', () => {
  render(<JukeboxBrowsePanel onClose={vi.fn()} />);
  fireEvent.click(screen.getByRole('button', { name: 'Search' }));
  expect(screen.getByTestId('search-tab')).toBeInTheDocument();
  expect(screen.queryByTestId('quick-hit-tab')).not.toBeInTheDocument();
});

test('switches to the Next Up tab', () => {
  render(<JukeboxBrowsePanel onClose={vi.fn()} />);
  fireEvent.click(screen.getByRole('button', { name: 'Next Up' }));
  expect(screen.getByTestId('jukebox-next-up-tab')).toBeInTheDocument();
  expect(screen.queryByTestId('quick-hit-tab')).not.toBeInTheDocument();
});

test('selecting an album from Quick Hit drills into JukeboxAlbumView', () => {
  render(<JukeboxBrowsePanel onClose={vi.fn()} />);
  fireEvent.click(screen.getByText('select-quickhit-album'));
  expect(screen.getByTestId('jukebox-album-view')).toBeInTheDocument();
  expect(screen.getByText('album-view: Quick Hit Album')).toBeInTheDocument();
});

test('selecting an artist from Search drills into JukeboxArtistView, and selecting an album from there drills into JukeboxAlbumView', () => {
  render(<JukeboxBrowsePanel onClose={vi.fn()} />);
  fireEvent.click(screen.getByRole('button', { name: 'Search' }));
  fireEvent.click(screen.getByText('select-search-artist'));
  expect(screen.getByTestId('jukebox-artist-view')).toBeInTheDocument();
  expect(screen.getByText('artist-view: Search Artist')).toBeInTheDocument();

  fireEvent.click(screen.getByText('select-album-from-artist'));
  expect(screen.getByTestId('jukebox-album-view')).toBeInTheDocument();
  expect(screen.getByText('album-view: Album From Artist')).toBeInTheDocument();
});

test('Back from the album view drilled from an artist returns to that artist\'s view, not straight to search results', () => {
  render(<JukeboxBrowsePanel onClose={vi.fn()} />);
  fireEvent.click(screen.getByRole('button', { name: 'Search' }));
  fireEvent.click(screen.getByText('select-search-artist'));
  fireEvent.click(screen.getByText('select-album-from-artist'));

  fireEvent.click(screen.getByText('back-from-album'));

  expect(screen.queryByTestId('jukebox-album-view')).not.toBeInTheDocument();
  expect(screen.getByTestId('jukebox-artist-view')).toBeInTheDocument();
});

test('Back from a view drilled directly from search results returns to search results', () => {
  render(<JukeboxBrowsePanel onClose={vi.fn()} />);
  fireEvent.click(screen.getByRole('button', { name: 'Search' }));
  fireEvent.click(screen.getByText('select-search-album'));
  expect(screen.getByTestId('jukebox-album-view')).toBeInTheDocument();

  fireEvent.click(screen.getByText('back-from-album'));

  expect(screen.queryByTestId('jukebox-album-view')).not.toBeInTheDocument();
  expect(screen.getByTestId('search-tab')).toBeInTheDocument();
});

test('switching tabs while drilled in resets the drill-down stack', () => {
  render(<JukeboxBrowsePanel onClose={vi.fn()} />);
  fireEvent.click(screen.getByText('select-quickhit-album'));
  expect(screen.getByTestId('jukebox-album-view')).toBeInTheDocument();

  fireEvent.click(screen.getByRole('button', { name: 'Search' }));

  expect(screen.queryByTestId('jukebox-album-view')).not.toBeInTheDocument();
  expect(screen.getByTestId('search-tab')).toBeInTheDocument();
});

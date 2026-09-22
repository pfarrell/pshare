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
      {/* Uncontrolled on purpose: its value lives in the DOM node, so it's lost if the tab remounts. */}
      <input data-testid="search-input" placeholder="mock search" />
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
vi.mock('./JukeboxTracksPanel', () => ({
  default: ({ album, onClose }) => (
    <div data-testid="jukebox-tracks-panel">
      <span>tracks-panel: {album.title}</span>
      <button onClick={onClose}>close-tracks-panel</button>
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
  expect(screen.getByTestId('search-tab')).toBeVisible();
  expect(screen.queryByTestId('quick-hit-tab')).not.toBeInTheDocument();
});

test('switches to the Next Up tab', () => {
  render(<JukeboxBrowsePanel onClose={vi.fn()} />);
  fireEvent.click(screen.getByRole('button', { name: 'Next Up' }));
  expect(screen.getByTestId('jukebox-next-up-tab')).toBeInTheDocument();
  expect(screen.queryByTestId('quick-hit-tab')).not.toBeInTheDocument();
  expect(screen.queryByTestId('search-tab')).not.toBeVisible();
});

test('selecting an album from Quick Hit opens the tracks panel and leaves the grid in place', () => {
  render(<JukeboxBrowsePanel onClose={vi.fn()} />);
  fireEvent.click(screen.getByText('select-quickhit-album'));

  expect(screen.getByText('tracks-panel: Quick Hit Album')).toBeInTheDocument();
  expect(screen.getByTestId('quick-hit-tab')).toBeInTheDocument();
});

test('the tracks panel is a sibling of the browse panel, not inside it (so drags in one never scroll the other)', () => {
  const { container } = render(<JukeboxBrowsePanel onClose={vi.fn()} />);
  fireEvent.click(screen.getByText('select-quickhit-album'));

  const tracksPanel = screen.getByTestId('jukebox-tracks-panel');
  expect(tracksPanel.closest('.jukebox-browse-panel')).toBeNull();
  expect(container.querySelector('.jukebox-browse-panel')).not.toBeNull();
});

test('selecting an album from Search opens the tracks panel and keeps the search results', () => {
  render(<JukeboxBrowsePanel onClose={vi.fn()} />);
  fireEvent.click(screen.getByRole('button', { name: 'Search' }));
  fireEvent.click(screen.getByText('select-search-album'));

  expect(screen.getByText('tracks-panel: Search Album')).toBeInTheDocument();
  expect(screen.getByTestId('search-tab')).toBeVisible();
});

test('selecting an artist still drills into JukeboxArtistView inside the browse panel; an album from there opens the tracks panel', () => {
  render(<JukeboxBrowsePanel onClose={vi.fn()} />);
  fireEvent.click(screen.getByRole('button', { name: 'Search' }));
  fireEvent.click(screen.getByText('select-search-artist'));
  expect(screen.getByText('artist-view: Search Artist')).toBeInTheDocument();
  expect(screen.queryByTestId('jukebox-tracks-panel')).not.toBeInTheDocument();

  fireEvent.click(screen.getByText('select-album-from-artist'));

  expect(screen.getByText('tracks-panel: Album From Artist')).toBeInTheDocument();
  expect(screen.getByTestId('jukebox-artist-view')).toBeInTheDocument(); // artist view stays
});

test('Back from the artist view returns to search results', () => {
  render(<JukeboxBrowsePanel onClose={vi.fn()} />);
  fireEvent.click(screen.getByRole('button', { name: 'Search' }));
  fireEvent.click(screen.getByText('select-search-artist'));

  fireEvent.click(screen.getByText('back-from-artist'));

  expect(screen.queryByTestId('jukebox-artist-view')).not.toBeInTheDocument();
  expect(screen.getByTestId('search-tab')).toBeVisible();
});

test('selecting a different album swaps the tracks panel contents', () => {
  render(<JukeboxBrowsePanel onClose={vi.fn()} />);
  fireEvent.click(screen.getByText('select-quickhit-album'));
  fireEvent.click(screen.getByRole('button', { name: 'Search' }));
  fireEvent.click(screen.getByText('select-search-album'));

  expect(screen.getAllByTestId('jukebox-tracks-panel')).toHaveLength(1);
  expect(screen.getByText('tracks-panel: Search Album')).toBeInTheDocument();
});

test('closing the tracks panel removes it without touching the browse panel', () => {
  const onClose = vi.fn();
  render(<JukeboxBrowsePanel onClose={onClose} />);
  fireEvent.click(screen.getByText('select-quickhit-album'));

  fireEvent.click(screen.getByText('close-tracks-panel'));

  expect(screen.queryByTestId('jukebox-tracks-panel')).not.toBeInTheDocument();
  expect(screen.getByTestId('quick-hit-tab')).toBeInTheDocument();
  expect(onClose).not.toHaveBeenCalled();
});

test('switching tabs leaves the tracks panel open', () => {
  render(<JukeboxBrowsePanel onClose={vi.fn()} />);
  fireEvent.click(screen.getByText('select-quickhit-album'));

  fireEvent.click(screen.getByRole('button', { name: 'Search' }));

  expect(screen.getByTestId('jukebox-tracks-panel')).toBeInTheDocument();
  expect(screen.getByTestId('search-tab')).toBeVisible();
});

test('closing the browse panel takes the tracks panel with it', () => {
  const { unmount } = render(<JukeboxBrowsePanel onClose={vi.fn()} />);
  fireEvent.click(screen.getByText('select-quickhit-album'));
  expect(screen.getByTestId('jukebox-tracks-panel')).toBeInTheDocument();

  unmount();

  expect(screen.queryByTestId('jukebox-tracks-panel')).not.toBeInTheDocument();
});

test('the search tab is hidden, not unmounted, while an artist view is on top — so Back returns to the same query and results', () => {
  render(<JukeboxBrowsePanel onClose={vi.fn()} />);
  fireEvent.click(screen.getByRole('button', { name: 'Search' }));
  fireEvent.change(screen.getByTestId('search-input'), { target: { value: 'monk' } });

  fireEvent.click(screen.getByText('select-search-artist'));
  expect(screen.getByTestId('jukebox-artist-view')).toBeInTheDocument();
  expect(screen.getByTestId('search-tab')).not.toBeVisible();

  fireEvent.click(screen.getByText('back-from-artist'));

  expect(screen.getByTestId('search-tab')).toBeVisible();
  expect(screen.getByTestId('search-input')).toHaveValue('monk');
});

test('switching to another tab and back keeps the search query and results', () => {
  render(<JukeboxBrowsePanel onClose={vi.fn()} />);
  fireEvent.click(screen.getByRole('button', { name: 'Search' }));
  fireEvent.change(screen.getByTestId('search-input'), { target: { value: 'monk' } });

  fireEvent.click(screen.getByRole('button', { name: 'Next Up' }));
  fireEvent.click(screen.getByRole('button', { name: 'Search' }));

  expect(screen.getByTestId('search-input')).toHaveValue('monk');
});

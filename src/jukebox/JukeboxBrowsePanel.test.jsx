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
  default: ({ onSelectArtist, onSelectAlbum, onSelectPlaylist, onSelectCollection, onEnqueue }) => (
    <div data-testid="search-tab">
      {/* Uncontrolled on purpose: its value lives in the DOM node, so it's lost if the tab remounts. */}
      <input data-testid="search-input" placeholder="mock search" />
      <button onClick={() => onSelectArtist({ id: 2, name: 'Search Artist' })}>select-search-artist</button>
      <button onClick={() => onSelectAlbum({ id: 3, title: 'Search Album' })}>select-search-album</button>
      <button onClick={() => onSelectPlaylist({ id: 5, name: 'Search Playlist' })}>select-search-playlist</button>
      <button onClick={() => onSelectCollection({ id: 6, name: 'Search Collection' })}>select-search-collection</button>
      <button onClick={onEnqueue}>search-enqueue</button>
    </div>
  ),
}));
vi.mock('./JukeboxArtistView', () => ({
  default: ({ artist, onSelectAlbum, onBack, onEnqueue }) => (
    <div data-testid="jukebox-artist-view">
      <span>artist-view: {artist.name}</span>
      <button onClick={() => onSelectAlbum({ id: 4, title: 'Album From Artist' })}>select-album-from-artist</button>
      <button onClick={onBack}>back-from-artist</button>
      <button onClick={onEnqueue}>artist-view-enqueue</button>
    </div>
  ),
}));
vi.mock('./JukeboxCollectionView', () => ({
  default: ({ collection, onSelectAlbum, onBack, onEnqueue }) => (
    <div data-testid="jukebox-collection-view">
      <span>collection-view: {collection.name}</span>
      <button onClick={() => onSelectAlbum({ id: 7, title: 'Album From Collection' })}>select-album-from-collection</button>
      <button onClick={onBack}>back-from-collection</button>
      <button onClick={onEnqueue}>collection-view-enqueue</button>
    </div>
  ),
}));
vi.mock('./JukeboxTracksPanel', () => ({
  default: ({ album, onClose, onEnqueue }) => (
    <div data-testid="jukebox-tracks-panel">
      <span>tracks-panel: {album.title}</span>
      <button onClick={onClose}>close-tracks-panel</button>
      <button onClick={onEnqueue}>tracks-panel-enqueue</button>
    </div>
  ),
}));
vi.mock('./JukeboxPlaylistPanel', () => ({
  default: ({ playlist, onClose, onEnqueue }) => (
    <div data-testid="jukebox-playlist-panel">
      <span>playlist-panel: {playlist.name}</span>
      <button onClick={onClose}>close-playlist-panel</button>
      <button onClick={onEnqueue}>playlist-panel-enqueue</button>
    </div>
  ),
}));
vi.mock('./JukeboxNextUpTab', () => ({ default: () => <div data-testid="jukebox-next-up-tab" /> }));

const renderPanel = (activeTab = 'quickhit', extraProps = {}) =>
  render(<JukeboxBrowsePanel activeTab={activeTab} {...extraProps} />);
const drawer = (container) => container.querySelector('.jukebox-browse-panel');

test('shows Quick Hit when that tab is active', () => {
  renderPanel('quickhit');
  expect(screen.getByTestId('quick-hit-tab')).toBeInTheDocument();
});

test('shows Search when that tab is active, and only that tab\'s content', () => {
  renderPanel('search');
  expect(screen.getByTestId('search-tab')).toBeVisible();
  expect(screen.queryByTestId('quick-hit-tab')).not.toBeInTheDocument();
});

test('shows Next Up when that tab is active', () => {
  renderPanel('nextup');
  expect(screen.getByTestId('jukebox-next-up-tab')).toBeInTheDocument();
  expect(screen.queryByTestId('quick-hit-tab')).not.toBeInTheDocument();
  expect(screen.getByTestId('search-tab')).not.toBeVisible();
});

test('the drawer is visible when a tab is active', () => {
  const { container } = renderPanel('quickhit');
  expect(drawer(container)).toBeVisible();
});

test('the drawer is hidden — but still mounted — when closed (activeTab null)', () => {
  const { container } = renderPanel(null);
  expect(drawer(container)).toBeInTheDocument();
  expect(drawer(container)).not.toBeVisible();
});

test('has no tab row or close button of its own any more (the bottom bar owns that)', () => {
  renderPanel('quickhit');
  expect(screen.queryByRole('button', { name: 'Close' })).not.toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'Quick Hit' })).not.toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'Next Up' })).not.toBeInTheDocument();
});

test('selecting an album from Quick Hit opens the tracks panel and leaves the grid in place', () => {
  renderPanel('quickhit');
  fireEvent.click(screen.getByText('select-quickhit-album'));

  expect(screen.getByText('tracks-panel: Quick Hit Album')).toBeInTheDocument();
  expect(screen.getByTestId('quick-hit-tab')).toBeInTheDocument();
});

test('the tracks panel is a sibling of the drawer, not inside it (so drags in one never scroll the other)', () => {
  const { container } = renderPanel('quickhit');
  fireEvent.click(screen.getByText('select-quickhit-album'));

  expect(screen.getByTestId('jukebox-tracks-panel').closest('.jukebox-browse-panel')).toBeNull();
  expect(drawer(container)).not.toBeNull();
});

test('selecting an album from Search opens the tracks panel and keeps the search results', () => {
  renderPanel('search');
  fireEvent.click(screen.getByText('select-search-album'));

  expect(screen.getByText('tracks-panel: Search Album')).toBeInTheDocument();
  expect(screen.getByTestId('search-tab')).toBeVisible();
});

test('selecting an artist drills into the artist view; an album from there opens the tracks panel', () => {
  renderPanel('search');
  fireEvent.click(screen.getByText('select-search-artist'));
  expect(screen.getByText('artist-view: Search Artist')).toBeInTheDocument();
  expect(screen.queryByTestId('jukebox-tracks-panel')).not.toBeInTheDocument();

  fireEvent.click(screen.getByText('select-album-from-artist'));

  expect(screen.getByText('tracks-panel: Album From Artist')).toBeInTheDocument();
  expect(screen.getByTestId('jukebox-artist-view')).toBeInTheDocument();
});

test('Back from the artist view returns to search results', () => {
  renderPanel('search');
  fireEvent.click(screen.getByText('select-search-artist'));

  fireEvent.click(screen.getByText('back-from-artist'));

  expect(screen.queryByTestId('jukebox-artist-view')).not.toBeInTheDocument();
  expect(screen.getByTestId('search-tab')).toBeVisible();
});

test('closing the tracks panel removes it without closing the drawer', () => {
  const { container } = renderPanel('quickhit');
  fireEvent.click(screen.getByText('select-quickhit-album'));

  fireEvent.click(screen.getByText('close-tracks-panel'));

  expect(screen.queryByTestId('jukebox-tracks-panel')).not.toBeInTheDocument();
  expect(drawer(container)).toBeVisible();
});

test('selecting a different album swaps the tracks panel contents', () => {
  const { rerender } = renderPanel('quickhit');
  fireEvent.click(screen.getByText('select-quickhit-album'));
  rerender(<JukeboxBrowsePanel activeTab="search" />);
  fireEvent.click(screen.getByText('select-search-album'));

  expect(screen.getAllByTestId('jukebox-tracks-panel')).toHaveLength(1);
  expect(screen.getByText('tracks-panel: Search Album')).toBeInTheDocument();
});

test('switching tabs leaves the tracks panel open', () => {
  const { rerender } = renderPanel('quickhit');
  fireEvent.click(screen.getByText('select-quickhit-album'));

  rerender(<JukeboxBrowsePanel activeTab="search" />);

  expect(screen.getByTestId('jukebox-tracks-panel')).toBeInTheDocument();
  expect(screen.getByTestId('search-tab')).toBeVisible();
});

test('closing the drawer closes the tracks panel too, and it does not reappear on reopen', () => {
  const { rerender } = renderPanel('quickhit');
  fireEvent.click(screen.getByText('select-quickhit-album'));
  expect(screen.getByTestId('jukebox-tracks-panel')).toBeInTheDocument();

  rerender(<JukeboxBrowsePanel activeTab={null} />);
  expect(screen.queryByTestId('jukebox-tracks-panel')).not.toBeInTheDocument();

  rerender(<JukeboxBrowsePanel activeTab="quickhit" />);
  expect(screen.queryByTestId('jukebox-tracks-panel')).not.toBeInTheDocument();
});

test('the search tab is hidden, not unmounted, while an artist view is on top — so Back returns to the same query', () => {
  renderPanel('search');
  fireEvent.change(screen.getByTestId('search-input'), { target: { value: 'monk' } });

  fireEvent.click(screen.getByText('select-search-artist'));
  expect(screen.getByTestId('jukebox-artist-view')).toBeInTheDocument();
  expect(screen.getByTestId('search-tab')).not.toBeVisible();

  fireEvent.click(screen.getByText('back-from-artist'));

  expect(screen.getByTestId('search-tab')).toBeVisible();
  expect(screen.getByTestId('search-input')).toHaveValue('monk');
});

test('switching to another tab and back, or closing and reopening, keeps the search query', () => {
  const { rerender } = renderPanel('search');
  fireEvent.change(screen.getByTestId('search-input'), { target: { value: 'monk' } });

  rerender(<JukeboxBrowsePanel activeTab="nextup" />);
  rerender(<JukeboxBrowsePanel activeTab="search" />);
  expect(screen.getByTestId('search-input')).toHaveValue('monk');

  rerender(<JukeboxBrowsePanel activeTab={null} />);
  rerender(<JukeboxBrowsePanel activeTab="search" />);
  expect(screen.getByTestId('search-input')).toHaveValue('monk');
});

test('switching to a different tab dismisses an open artist view', () => {
  const { rerender } = renderPanel('search');
  fireEvent.click(screen.getByText('select-search-artist'));
  expect(screen.getByTestId('jukebox-artist-view')).toBeInTheDocument();

  rerender(<JukeboxBrowsePanel activeTab="nextup" />);
  rerender(<JukeboxBrowsePanel activeTab="search" />);

  expect(screen.queryByTestId('jukebox-artist-view')).not.toBeInTheDocument();
  expect(screen.getByTestId('search-tab')).toBeVisible();
});

test('closing and reopening the SAME tab keeps an open artist view', () => {
  const { rerender } = renderPanel('search');
  fireEvent.click(screen.getByText('select-search-artist'));

  rerender(<JukeboxBrowsePanel activeTab={null} />);
  rerender(<JukeboxBrowsePanel activeTab="search" />);

  expect(screen.getByTestId('jukebox-artist-view')).toBeInTheDocument();
});

test('onEnqueue is passed through to the tracks panel, the artist view, and Search', () => {
  const onEnqueue = vi.fn();
  renderPanel('search', { onEnqueue });
  fireEvent.click(screen.getByText('select-search-artist'));

  fireEvent.click(screen.getByText('artist-view-enqueue'));
  expect(onEnqueue).toHaveBeenCalledTimes(1);

  fireEvent.click(screen.getByText('back-from-artist'));
  fireEvent.click(screen.getByText('search-enqueue'));
  expect(onEnqueue).toHaveBeenCalledTimes(2);

  fireEvent.click(screen.getByText('select-search-album'));
  fireEvent.click(screen.getByText('tracks-panel-enqueue'));
  expect(onEnqueue).toHaveBeenCalledTimes(3);
});

test('selecting a playlist from Search opens the playlist panel, and onEnqueue reaches it', () => {
  const onEnqueue = vi.fn();
  renderPanel('search', { onEnqueue });

  fireEvent.click(screen.getByText('select-search-playlist'));

  expect(screen.getByText('playlist-panel: Search Playlist')).toBeInTheDocument();
  fireEvent.click(screen.getByText('playlist-panel-enqueue'));
  expect(onEnqueue).toHaveBeenCalledTimes(1);
});

test('the playlist panel is a sibling of the drawer, not inside it', () => {
  const { container } = renderPanel('search');
  fireEvent.click(screen.getByText('select-search-playlist'));

  expect(screen.getByTestId('jukebox-playlist-panel').closest('.jukebox-browse-panel')).toBeNull();
  expect(drawer(container)).not.toBeNull();
});

test('closing the playlist panel removes it without closing the drawer', () => {
  const { container } = renderPanel('search');
  fireEvent.click(screen.getByText('select-search-playlist'));

  fireEvent.click(screen.getByText('close-playlist-panel'));

  expect(screen.queryByTestId('jukebox-playlist-panel')).not.toBeInTheDocument();
  expect(drawer(container)).toBeVisible();
});

test('selecting a playlist closes an open album tracks panel, and vice versa — only one at a time', () => {
  renderPanel('search');
  fireEvent.click(screen.getByText('select-search-album'));
  expect(screen.getByTestId('jukebox-tracks-panel')).toBeInTheDocument();

  fireEvent.click(screen.getByText('select-search-playlist'));
  expect(screen.queryByTestId('jukebox-tracks-panel')).not.toBeInTheDocument();
  expect(screen.getByTestId('jukebox-playlist-panel')).toBeInTheDocument();

  fireEvent.click(screen.getByText('select-search-album'));
  expect(screen.queryByTestId('jukebox-playlist-panel')).not.toBeInTheDocument();
  expect(screen.getByTestId('jukebox-tracks-panel')).toBeInTheDocument();
});

test('closing the drawer closes the playlist panel too, and it does not reappear on reopen', () => {
  const { rerender } = renderPanel('search');
  fireEvent.click(screen.getByText('select-search-playlist'));
  expect(screen.getByTestId('jukebox-playlist-panel')).toBeInTheDocument();

  rerender(<JukeboxBrowsePanel activeTab={null} />);
  expect(screen.queryByTestId('jukebox-playlist-panel')).not.toBeInTheDocument();

  rerender(<JukeboxBrowsePanel activeTab="search" />);
  expect(screen.queryByTestId('jukebox-playlist-panel')).not.toBeInTheDocument();
});

test('selecting a collection drills into the collection view; an album from there opens the tracks panel', () => {
  renderPanel('search');
  fireEvent.click(screen.getByText('select-search-collection'));
  expect(screen.getByText('collection-view: Search Collection')).toBeInTheDocument();
  expect(screen.queryByTestId('jukebox-tracks-panel')).not.toBeInTheDocument();

  fireEvent.click(screen.getByText('select-album-from-collection'));

  expect(screen.getByText('tracks-panel: Album From Collection')).toBeInTheDocument();
  expect(screen.getByTestId('jukebox-collection-view')).toBeInTheDocument();
});

test('Back from the collection view returns to search results', () => {
  renderPanel('search');
  fireEvent.click(screen.getByText('select-search-collection'));

  fireEvent.click(screen.getByText('back-from-collection'));

  expect(screen.queryByTestId('jukebox-collection-view')).not.toBeInTheDocument();
  expect(screen.getByTestId('search-tab')).toBeVisible();
});

test('onEnqueue reaches the collection view\'s Shuffle All', () => {
  const onEnqueue = vi.fn();
  renderPanel('search', { onEnqueue });
  fireEvent.click(screen.getByText('select-search-collection'));

  fireEvent.click(screen.getByText('collection-view-enqueue'));

  expect(onEnqueue).toHaveBeenCalledTimes(1);
});

test('switching to a different tab dismisses an open collection view, same as an artist view', () => {
  const { rerender } = renderPanel('search');
  fireEvent.click(screen.getByText('select-search-collection'));
  expect(screen.getByTestId('jukebox-collection-view')).toBeInTheDocument();

  rerender(<JukeboxBrowsePanel activeTab="nextup" />);
  rerender(<JukeboxBrowsePanel activeTab="search" />);

  expect(screen.queryByTestId('jukebox-collection-view')).not.toBeInTheDocument();
});

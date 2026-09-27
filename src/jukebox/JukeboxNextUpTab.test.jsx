// src/jukebox/JukeboxNextUpTab.test.jsx
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { vi } from 'vitest';
import JukeboxNextUpTab from './JukeboxNextUpTab';

vi.mock('../stores/playerStore', () => ({ usePlayerStore: vi.fn() }));
vi.mock('./JukeboxTransport', () => ({ default: () => <div data-testid="jukebox-transport" /> }));
vi.mock('./JukeboxSavePlaylistModal', () => ({
  default: ({ trackIds, onClose, onSaved }) => (
    <div data-testid="jukebox-save-playlist-modal">
      <span data-testid="save-modal-track-ids">{JSON.stringify(trackIds)}</span>
      <button onClick={onClose}>close-save-modal</button>
      <button onClick={() => onSaved('Saved Name')}>trigger-saved</button>
    </div>
  ),
}));

import { usePlayerStore } from '../stores/playerStore';

const renderTab = () => render(<MemoryRouter><JukeboxNextUpTab /></MemoryRouter>);

test('shows an empty state when nothing is queued', () => {
  usePlayerStore.mockImplementation((selector) => selector({ playlist: [], currentTrackIndex: -1 }));
  renderTab();
  expect(screen.getByText('Nothing queued yet — try Browse')).toBeInTheDocument();
});

test('renders every queued track', () => {
  usePlayerStore.mockImplementation((selector) => selector({
    playlist: [
      { id: 1, title: 'Track One', url: '/stream/1', artist: {} },
      { id: 2, title: 'Track Two', url: '/stream/2', artist: {} },
    ],
    currentTrackIndex: 0,
  }));
  renderTab();
  expect(screen.getByText(/Track One/)).toBeInTheDocument();
  expect(screen.getByText(/Track Two/)).toBeInTheDocument();
});

test('renders the transport above the queue when there are tracks', () => {
  usePlayerStore.mockImplementation((selector) => selector({
    playlist: [{ id: 1, title: 'Track One', url: '/stream/1', artist: {} }],
    currentTrackIndex: 0,
  }));
  renderTab();
  const transport = screen.getByTestId('jukebox-transport');
  const firstTrack = screen.getByText(/Track One/);
  // DOCUMENT_POSITION_FOLLOWING (4): the track comes after the transport.
  expect(transport.compareDocumentPosition(firstTrack) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
});

test('still renders the transport when the queue is empty (so Clear/mode stay visible)', () => {
  usePlayerStore.mockImplementation((selector) => selector({ playlist: [], currentTrackIndex: -1 }));
  renderTab();
  expect(screen.getByTestId('jukebox-transport')).toBeInTheDocument();
});

test('hides already-played tracks, opening on the current track', () => {
  usePlayerStore.mockImplementation((selector) => selector({
    playlist: [
      { id: 1, title: 'Played Track', url: '/stream/1', artist: {} },
      { id: 2, title: 'Current Track', url: '/stream/2', artist: {} },
      { id: 3, title: 'Next Track', url: '/stream/3', artist: {} },
    ],
    currentTrackIndex: 1,
  }));
  renderTab();
  expect(screen.queryByText(/Played Track/)).not.toBeInTheDocument();
  expect(screen.getByText(/Current Track/)).toBeInTheDocument();
  expect(screen.getByText(/Next Track/)).toBeInTheDocument();
});

test('does not show a "Show previous" control when nothing is hidden', () => {
  usePlayerStore.mockImplementation((selector) => selector({
    playlist: [{ id: 1, title: 'Track One', url: '/stream/1', artist: {} }],
    currentTrackIndex: 0,
  }));
  renderTab();
  expect(screen.queryByRole('button', { name: /show previous/i })).not.toBeInTheDocument();
});

describe('swipe-to-delete', () => {
  const setup = () => {
    const removeTrackFromPlaylist = vi.fn();
    usePlayerStore.mockImplementation((selector) => selector({
      playlist: [
        { id: 1, title: 'Current Track', url: '/stream/1', artist: {} },
        { id: 2, title: 'Next Track', url: '/stream/2', artist: {} },
        { id: 3, title: 'Later Track', url: '/stream/3', artist: {} },
      ],
      currentTrackIndex: 0,
      removeTrackFromPlaylist,
    }));
    renderTab();
    return { removeTrackFromPlaylist };
  };

  const deleteButtonFor = (title) => screen.getByRole('button', { name: new RegExp(`remove.*${title}`, 'i') });

  test('does not show a delete button for the currently-playing row', () => {
    setup();
    expect(screen.queryByRole('button', { name: /remove.*current track/i })).not.toBeInTheDocument();
  });

  test('shows a delete button for upcoming rows', () => {
    setup();
    expect(deleteButtonFor('Next Track')).toBeInTheDocument();
    expect(deleteButtonFor('Later Track')).toBeInTheDocument();
  });

  test('tapping a row\'s delete button removes that track by its absolute playlist index', () => {
    const { removeTrackFromPlaylist } = setup();

    fireEvent.click(deleteButtonFor('Later Track'));

    expect(removeTrackFromPlaylist).toHaveBeenCalledWith(2);
  });

  test('opening a row (swiped open) closes any other open row', () => {
    setup();
    const rows = document.querySelectorAll('.jukebox-queue-row');
    const nextRow = [...rows].find((el) => el.textContent.includes('Next Track'));
    const laterRow = [...rows].find((el) => el.textContent.includes('Later Track'));

    // Simulate a completed swipe-open by driving the row past the reveal
    // threshold — a full horizontal drag-and-release, same as a real swipe.
    const drag = (row, dx) => {
      const content = row.querySelector('.jukebox-queue-row-content');
      fireEvent.touchStart(content, { touches: [{ clientX: 100, clientY: 100 }] });
      fireEvent.touchMove(content, { touches: [{ clientX: 100 - dx, clientY: 100 }] });
      fireEvent.touchEnd(content, { changedTouches: [{ clientX: 100 - dx, clientY: 100 }] });
    };

    drag(nextRow, 60);
    expect(nextRow.querySelector('.jukebox-queue-row-content').style.transform).toBe('translateX(-72px)');

    drag(laterRow, 60);
    expect(laterRow.querySelector('.jukebox-queue-row-content').style.transform).toBe('translateX(-72px)');
    expect(nextRow.querySelector('.jukebox-queue-row-content').style.transform).toBe('translateX(0px)');
  });
});

describe('save as playlist', () => {
  test('does not show a Save button when the queue is empty', () => {
    usePlayerStore.mockImplementation((selector) => selector({ playlist: [], currentTrackIndex: -1 }));
    renderTab();
    expect(screen.queryByRole('button', { name: /save as playlist/i })).not.toBeInTheDocument();
  });

  test('shows a Save button once something is queued', () => {
    usePlayerStore.mockImplementation((selector) => selector({
      playlist: [{ id: 1, title: 'Track One', url: '/stream/1', artist: {} }],
      currentTrackIndex: 0,
    }));
    renderTab();
    expect(screen.getByRole('button', { name: /save as playlist/i })).toBeInTheDocument();
  });

  test('tapping Save opens the modal with tracks from the current position onward, not already-played ones', () => {
    usePlayerStore.mockImplementation((selector) => selector({
      playlist: [
        { id: 1, title: 'Played Track', url: '/stream/1', artist: {} },
        { id: 2, title: 'Current Track', url: '/stream/2', artist: {} },
        { id: 3, title: 'Next Track', url: '/stream/3', artist: {} },
      ],
      currentTrackIndex: 1,
    }));
    renderTab();

    fireEvent.click(screen.getByRole('button', { name: /save as playlist/i }));

    expect(screen.getByTestId('jukebox-save-playlist-modal')).toBeInTheDocument();
    expect(screen.getByTestId('save-modal-track-ids')).toHaveTextContent(JSON.stringify([2, 3]));
  });

  test('closing the modal removes it', () => {
    usePlayerStore.mockImplementation((selector) => selector({
      playlist: [{ id: 1, title: 'Track One', url: '/stream/1', artist: {} }],
      currentTrackIndex: 0,
    }));
    renderTab();
    fireEvent.click(screen.getByRole('button', { name: /save as playlist/i }));

    fireEvent.click(screen.getByText('close-save-modal'));

    expect(screen.queryByTestId('jukebox-save-playlist-modal')).not.toBeInTheDocument();
  });

  test('a successful save closes the modal and reports the name up via onSaved', () => {
    usePlayerStore.mockImplementation((selector) => selector({
      playlist: [{ id: 1, title: 'Track One', url: '/stream/1', artist: {} }],
      currentTrackIndex: 0,
    }));
    const onSaved = vi.fn();
    render(<MemoryRouter><JukeboxNextUpTab onSaved={onSaved} /></MemoryRouter>);
    fireEvent.click(screen.getByRole('button', { name: /save as playlist/i }));

    fireEvent.click(screen.getByText('trigger-saved'));

    expect(onSaved).toHaveBeenCalledWith('Saved Name');
    expect(screen.queryByTestId('jukebox-save-playlist-modal')).not.toBeInTheDocument();
  });
});

test('each tap of "Show previous" reveals one more earlier track', () => {
  usePlayerStore.mockImplementation((selector) => selector({
    playlist: [
      { id: 1, title: 'Track A', url: '/stream/1', artist: {} },
      { id: 2, title: 'Track B', url: '/stream/2', artist: {} },
      { id: 3, title: 'Current Track', url: '/stream/3', artist: {} },
    ],
    currentTrackIndex: 2,
  }));
  renderTab();
  expect(screen.queryByText(/Track A/)).not.toBeInTheDocument();
  expect(screen.queryByText(/Track B/)).not.toBeInTheDocument();

  fireEvent.click(screen.getByRole('button', { name: /show previous/i }));
  expect(screen.queryByText(/Track A/)).not.toBeInTheDocument();
  expect(screen.getByText(/Track B/)).toBeInTheDocument();

  fireEvent.click(screen.getByRole('button', { name: /show previous/i }));
  expect(screen.getByText(/Track A/)).toBeInTheDocument();
  expect(screen.getByText(/Track B/)).toBeInTheDocument();
  // Fully scrolled back — nothing earlier left to reveal.
  expect(screen.queryByRole('button', { name: /show previous/i })).not.toBeInTheDocument();
});

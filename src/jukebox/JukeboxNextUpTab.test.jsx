// src/jukebox/JukeboxNextUpTab.test.jsx
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { vi } from 'vitest';
import JukeboxNextUpTab from './JukeboxNextUpTab';

vi.mock('../stores/playerStore', () => ({ usePlayerStore: vi.fn() }));
vi.mock('./JukeboxTransport', () => ({ default: () => <div data-testid="jukebox-transport" /> }));

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

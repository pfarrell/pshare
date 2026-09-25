// src/jukebox/JukeboxNextUpTab.test.jsx
import { render, screen } from '@testing-library/react';
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

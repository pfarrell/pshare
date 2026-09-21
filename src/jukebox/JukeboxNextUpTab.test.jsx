import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { vi } from 'vitest';
import JukeboxNextUpTab from './JukeboxNextUpTab';

vi.mock('../stores/playerStore', () => ({ usePlayerStore: vi.fn() }));

import { usePlayerStore } from '../stores/playerStore';

const renderTab = () => render(<MemoryRouter><JukeboxNextUpTab /></MemoryRouter>);

test('shows an empty state when nothing is queued', () => {
  usePlayerStore.mockImplementation((selector) => selector({ playlist: [], currentTrackIndex: -1 }));
  renderTab();
  expect(screen.getByText('Nothing queued yet — try Quick Hit or Search')).toBeInTheDocument();
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

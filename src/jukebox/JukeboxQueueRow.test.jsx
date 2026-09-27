import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { vi } from 'vitest';
import JukeboxQueueRow from './JukeboxQueueRow';

vi.mock('../stores/playerStore', () => ({ usePlayerStore: vi.fn() }));

import { usePlayerStore } from '../stores/playerStore';

const track = { id: 1, title: 'Test Track', url: '/stream/1', artist: {} };

const renderRow = (props = {}) => {
  usePlayerStore.mockImplementation((selector) => selector({
    playlist: [track],
    addTrack: vi.fn(),
    addTracks: vi.fn(),
    setPlaylist: vi.fn(),
    playTrackAtIndex: vi.fn(),
  }));
  return render(
    <MemoryRouter>
      <JukeboxQueueRow
        track={track}
        index={0}
        trackCount={1}
        isPlaying={false}
        isOpen={false}
        onOpenChange={vi.fn()}
        onRemove={vi.fn()}
        {...props}
      />
    </MemoryRouter>
  );
};

test('renders the track', () => {
  renderRow();
  expect(screen.getByText(/Test Track/)).toBeInTheDocument();
});

test('renders a delete button for a non-playing row', () => {
  renderRow({ isPlaying: false });
  expect(screen.getByRole('button', { name: /remove.*test track/i })).toBeInTheDocument();
});

test('does not render a delete button for the currently-playing row', () => {
  renderRow({ isPlaying: true });
  expect(screen.queryByRole('button', { name: /remove.*test track/i })).not.toBeInTheDocument();
});

test('tapping the delete button calls onRemove', () => {
  const onRemove = vi.fn();
  renderRow({ onRemove });

  fireEvent.click(screen.getByRole('button', { name: /remove.*test track/i }));

  expect(onRemove).toHaveBeenCalledTimes(1);
});

test('the content is closed (no offset) when isOpen is false', () => {
  const { container } = renderRow({ isOpen: false });
  const content = container.querySelector('.jukebox-queue-row-content');
  expect(content.style.transform).toBe('translateX(0px)');
});

test('the content is offset to reveal the delete button when isOpen is true', () => {
  const { container } = renderRow({ isOpen: true });
  const content = container.querySelector('.jukebox-queue-row-content');
  expect(content.style.transform).toBe('translateX(-72px)');
});

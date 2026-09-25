import { render, screen } from '@testing-library/react';
import { vi } from 'vitest';
import JukeboxNowPlaying from './JukeboxNowPlaying';

vi.mock('../stores/playerStore', () => ({ usePlayerStore: vi.fn() }));
vi.mock('../services/api', () => ({
  apiService: { getImageUrl: vi.fn(() => '/img/big/x.jpg') },
}));

import { usePlayerStore } from '../stores/playerStore';

test('shows an empty state when nothing is playing', () => {
  usePlayerStore.mockReturnValue(null);
  render(<JukeboxNowPlaying />);
  expect(screen.getByText('Nothing playing — tap Browse to pick something')).toBeInTheDocument();
});

test('shows the current track\'s art, title, and artist', () => {
  usePlayerStore.mockReturnValue({
    title: 'Test Track',
    artist: { name: 'Test Artist' },
    image_path: 'x.jpg',
  });
  render(<JukeboxNowPlaying />);
  expect(screen.getByText('Test Track')).toBeInTheDocument();
  expect(screen.getByText('Test Artist')).toBeInTheDocument();
  expect(screen.getByRole('img')).toHaveAttribute('src', '/img/big/x.jpg');
});

import { render, screen, fireEvent, act } from '@testing-library/react';
import { vi } from 'vitest';
import JukeboxScreensaver from './JukeboxScreensaver';

vi.mock('../services/api', () => ({
  apiService: {
    getRandomAlbums: vi.fn(),
    getRandomArtists: vi.fn(),
    getImageUrl: vi.fn((path, context) => (path ? `img:${context}:${path}` : null)),
  },
}));
vi.mock('../stores/profileFilterStore', () => ({ useProfileFilterStore: vi.fn() }));

import { apiService } from '../services/api';
import { useProfileFilterStore } from '../stores/profileFilterStore';

const album = (overrides = {}) => ({ id: 1, title: 'Album One', image_path: 'album1.jpg', artist: { id: 1, name: 'Artist One' }, ...overrides });
const artist = (overrides = {}) => ({ id: 2, name: 'Artist Two', image_path: 'artist2.jpg', ...overrides });

beforeEach(() => {
  vi.clearAllMocks();
  useProfileFilterStore.mockReturnValue(null);
  apiService.getRandomAlbums.mockResolvedValue({ data: [album()] });
  apiService.getRandomArtists.mockResolvedValue({ data: [artist()] });
});

afterEach(() => {
  vi.useRealTimers();
});

test('fetches albums and artists filtered by the active profile on mount', async () => {
  useProfileFilterStore.mockReturnValue(3);
  render(<JukeboxScreensaver onDismiss={vi.fn()} onView={vi.fn()} />);

  await act(async () => {});

  expect(apiService.getRandomAlbums).toHaveBeenCalledWith(10, 3);
  expect(apiService.getRandomArtists).toHaveBeenCalledWith(10, 3);
});

test('shows the album art first, using the album_page image context', async () => {
  render(<JukeboxScreensaver onDismiss={vi.fn()} onView={vi.fn()} />);

  await act(async () => {});

  expect(screen.getByRole('img')).toHaveAttribute('src', 'img:album_page:album1.jpg');
});

test('rotates to the next item after 20 seconds, using the artist_page context for an artist', async () => {
  vi.useFakeTimers();
  render(<JukeboxScreensaver onDismiss={vi.fn()} onView={vi.fn()} />);
  await act(async () => {});
  expect(screen.getByRole('img')).toHaveAttribute('src', 'img:album_page:album1.jpg');

  await act(async () => { await vi.advanceTimersByTimeAsync(20000); });

  expect(screen.getByRole('img')).toHaveAttribute('src', 'img:artist_page:artist2.jpg');
});

test('refetches a fresh pool once the current one is exhausted', async () => {
  vi.useFakeTimers();
  render(<JukeboxScreensaver onDismiss={vi.fn()} onView={vi.fn()} />);
  await act(async () => {});
  expect(apiService.getRandomAlbums).toHaveBeenCalledTimes(1);

  await act(async () => { await vi.advanceTimersByTimeAsync(20000); }); // advances to the artist item
  await act(async () => { await vi.advanceTimersByTimeAsync(20000); }); // pool now empty: triggers a refetch

  expect(apiService.getRandomAlbums).toHaveBeenCalledTimes(2);
});

test('a change in the active profile filter forces a fresh fetch, discarding the previous pool', async () => {
  useProfileFilterStore.mockReturnValue(1);
  const { rerender } = render(<JukeboxScreensaver onDismiss={vi.fn()} onView={vi.fn()} />);
  await act(async () => {});
  expect(apiService.getRandomAlbums).toHaveBeenCalledWith(10, 1);

  useProfileFilterStore.mockReturnValue(2);
  rerender(<JukeboxScreensaver onDismiss={vi.fn()} onView={vi.fn()} />);
  await act(async () => {});

  expect(apiService.getRandomAlbums).toHaveBeenLastCalledWith(10, 2);
});

test('tapping the background calls onDismiss', async () => {
  const onDismiss = vi.fn();
  render(<JukeboxScreensaver onDismiss={onDismiss} onView={vi.fn()} />);
  await act(async () => {});

  fireEvent.click(screen.getByRole('img'));

  expect(onDismiss).toHaveBeenCalledTimes(1);
});

test('tapping View calls onView with the current item instead of dismissing', async () => {
  const onDismiss = vi.fn();
  const onView = vi.fn();
  render(<JukeboxScreensaver onDismiss={onDismiss} onView={onView} />);
  await act(async () => {});

  fireEvent.click(screen.getByRole('button', { name: /view/i }));

  expect(onView).toHaveBeenCalledWith({ type: 'album', data: album() });
  expect(onDismiss).not.toHaveBeenCalled();
});

test('renders nothing when both fetches fail, and does not crash', async () => {
  apiService.getRandomAlbums.mockRejectedValue(new Error('network'));
  apiService.getRandomArtists.mockRejectedValue(new Error('network'));
  const { container } = render(<JukeboxScreensaver onDismiss={vi.fn()} onView={vi.fn()} />);

  await act(async () => {});

  expect(container).toBeEmptyDOMElement();
});

test('renders nothing when both pools are empty', async () => {
  apiService.getRandomAlbums.mockResolvedValue({ data: [] });
  apiService.getRandomArtists.mockResolvedValue({ data: [] });
  const { container } = render(<JukeboxScreensaver onDismiss={vi.fn()} onView={vi.fn()} />);

  await act(async () => {});

  expect(container).toBeEmptyDOMElement();
});

test('falls back to the placeholder icon when image_path is missing', async () => {
  apiService.getRandomAlbums.mockResolvedValue({ data: [album({ image_path: null })] });
  render(<JukeboxScreensaver onDismiss={vi.fn()} onView={vi.fn()} />);

  await act(async () => {});

  expect(screen.queryByRole('img')).not.toBeInTheDocument();
});

test('a malformed item with no name/title still renders a safe View label, not a crash', async () => {
  apiService.getRandomAlbums.mockResolvedValue({ data: [album({ title: undefined })] });
  render(<JukeboxScreensaver onDismiss={vi.fn()} onView={vi.fn()} />);

  await act(async () => {});

  expect(screen.getByRole('button', { name: /view/i })).toBeInTheDocument();
});

// src/jukebox/JukeboxFactoidScreensaver.test.jsx
import { render, screen, fireEvent, act } from '@testing-library/react';
import { vi } from 'vitest';
import JukeboxFactoidScreensaver from './JukeboxFactoidScreensaver';

vi.mock('../services/api', () => ({
  apiService: {
    getFactoidsForTrack: vi.fn(),
    getRandomFactoids: vi.fn(),
    getRandomAlbums: vi.fn(),
    getRandomArtists: vi.fn(),
    getRandomPhotos: vi.fn(),
    getImageUrl: vi.fn((path, context) => (path ? `img:${context}:${path}` : null)),
  },
}));
vi.mock('../stores/playerStore', () => ({ usePlayerStore: vi.fn() }));
vi.mock('../stores/profileFilterStore', () => ({ useProfileFilterStore: vi.fn() }));

import { apiService } from '../services/api';
import { usePlayerStore } from '../stores/playerStore';
import { useProfileFilterStore } from '../stores/profileFilterStore';

const factoid = (over = {}) => ({
  id: 1, kind: 'album', target_id: 10, subject: 'Aja',
  text: 'The solo was cut in a single take.',
  source_url: 'https://www.rollingstone.com/story', source_title: 'Rolling Stone', ...over,
});

const track = (over = {}) => ({
  id: 5, title: 'Deacon Blues', image_path: 'aja.jpg',
  album: { id: 10, title: 'Aja' }, artist: { id: 3, name: 'Steely Dan' }, ...over,
});

beforeEach(() => {
  vi.clearAllMocks();
  useProfileFilterStore.mockReturnValue(null);
  usePlayerStore.mockImplementation((selector) => selector({ currentTrack: track() }));
  apiService.getFactoidsForTrack.mockResolvedValue({ data: { factoids: [factoid()] } });
  apiService.getRandomFactoids.mockResolvedValue({ data: { factoids: [factoid({ id: 2, text: 'A random fact.' })] } });
  apiService.getRandomAlbums.mockResolvedValue({ data: [{ id: 10, title: 'Aja', image_path: 'aja.jpg', artist: { id: 3, name: 'Steely Dan' } }] });
  apiService.getRandomArtists.mockResolvedValue({ data: [{ id: 3, name: 'Steely Dan', image_path: 'sd.jpg' }] });
});

afterEach(() => { vi.useRealTimers(); });

test('fetches factoids for the playing track and renders the text and subject', async () => {
  render(<JukeboxFactoidScreensaver onDismiss={vi.fn()} onView={vi.fn()} />);
  await act(async () => {});

  expect(apiService.getFactoidsForTrack).toHaveBeenCalledWith(5);
  expect(screen.getByText('The solo was cut in a single take.')).toBeInTheDocument();
  expect(screen.getByText(/Aja/)).toBeInTheDocument();
});

test('shows the source host as attribution', async () => {
  render(<JukeboxFactoidScreensaver onDismiss={vi.fn()} onView={vi.fn()} />);
  await act(async () => {});

  expect(screen.getByText(/rollingstone\.com/)).toBeInTheDocument();
});

test('rotates to the next factoid on the timer', async () => {
  vi.useFakeTimers();
  apiService.getFactoidsForTrack.mockResolvedValue({
    data: { factoids: [factoid(), factoid({ id: 2, text: 'A second fact entirely.' })] },
  });
  render(<JukeboxFactoidScreensaver onDismiss={vi.fn()} onView={vi.fn()} />);
  await act(async () => {});
  expect(screen.getByText('The solo was cut in a single take.')).toBeInTheDocument();

  await act(async () => { await vi.advanceTimersByTimeAsync(30000); });

  expect(screen.getByText('A second fact entirely.')).toBeInTheDocument();
});

test('falls back to random factoids when nothing is playing', async () => {
  usePlayerStore.mockImplementation((selector) => selector({ currentTrack: null }));
  render(<JukeboxFactoidScreensaver onDismiss={vi.fn()} onView={vi.fn()} />);
  await act(async () => {});

  expect(apiService.getRandomFactoids).toHaveBeenCalled();
  expect(apiService.getFactoidsForTrack).not.toHaveBeenCalled();
  expect(screen.getByText('A random fact.')).toBeInTheDocument();
});

test('a track with no album and no artist still renders without crashing', async () => {
  usePlayerStore.mockImplementation((selector) =>
    selector({ currentTrack: track({ album: null, artist: null }) }));
  render(<JukeboxFactoidScreensaver onDismiss={vi.fn()} onView={vi.fn()} />);
  await act(async () => {});

  expect(screen.getByText('The solo was cut in a single take.')).toBeInTheDocument();
});

test('a factoid with no subject renders the text without crashing the tree', async () => {
  // There is no error boundary in this app: a throw here blanks the kiosk.
  apiService.getFactoidsForTrack.mockResolvedValue({
    data: { factoids: [factoid({ subject: null, source_url: null })] },
  });
  render(<JukeboxFactoidScreensaver onDismiss={vi.fn()} onView={vi.fn()} />);
  await act(async () => {});

  expect(screen.getByText('The solo was cut in a single take.')).toBeInTheDocument();
});

test('falls back to the art screensaver when the cache is empty', async () => {
  apiService.getFactoidsForTrack.mockResolvedValue({ data: { factoids: [] } });
  render(<JukeboxFactoidScreensaver onDismiss={vi.fn()} onView={vi.fn()} />);
  await act(async () => {});

  // An empty cache is the NORMAL day-one state, so this must look deliberate,
  // never a black rectangle indistinguishable from a dead kiosk.
  expect(apiService.getRandomAlbums).toHaveBeenCalled();
  expect(screen.getByRole('img')).toBeInTheDocument();
});

test('falls back to the art screensaver when the request fails', async () => {
  apiService.getFactoidsForTrack.mockRejectedValue(new Error('network'));
  render(<JukeboxFactoidScreensaver onDismiss={vi.fn()} onView={vi.fn()} />);
  await act(async () => {});

  expect(apiService.getRandomAlbums).toHaveBeenCalled();
});

test('tapping the factoid calls onDismiss', async () => {
  const onDismiss = vi.fn();
  render(<JukeboxFactoidScreensaver onDismiss={onDismiss} onView={vi.fn()} />);
  await act(async () => {});

  fireEvent.click(screen.getByText('The solo was cut in a single take.'));

  expect(onDismiss).toHaveBeenCalledTimes(1);
});

test('refetches when the playing track changes', async () => {
  const { rerender } = render(<JukeboxFactoidScreensaver onDismiss={vi.fn()} onView={vi.fn()} />);
  await act(async () => {});
  expect(apiService.getFactoidsForTrack).toHaveBeenCalledWith(5);

  usePlayerStore.mockImplementation((selector) => selector({ currentTrack: track({ id: 6 }) }));
  rerender(<JukeboxFactoidScreensaver onDismiss={vi.fn()} onView={vi.fn()} />);
  await act(async () => {});

  expect(apiService.getFactoidsForTrack).toHaveBeenLastCalledWith(6);
});

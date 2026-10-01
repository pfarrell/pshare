// src/jukebox/JukeboxScreensaver.test.jsx
import { render, screen, fireEvent, act } from '@testing-library/react';
import { vi } from 'vitest';
import JukeboxScreensaver from './JukeboxScreensaver';

vi.mock('../services/api', () => ({
  apiService: {
    getRandomAlbums: vi.fn(),
    getRandomArtists: vi.fn(),
    getRandomPhotos: vi.fn(),
    getImageUrl: vi.fn((path, context) => (path ? `img:${context}:${path}` : null)),
  },
}));
vi.mock('../stores/profileFilterStore', () => ({ useProfileFilterStore: vi.fn() }));

import { apiService } from '../services/api';
import { useProfileFilterStore } from '../stores/profileFilterStore';

const album = (overrides = {}) => ({ id: 1, title: 'Album One', image_path: 'album1.jpg', artist: { id: 1, name: 'Artist One' }, ...overrides });
const artist = (overrides = {}) => ({ id: 2, name: 'Artist Two', image_path: 'artist2.jpg', ...overrides });
const photo = (overrides = {}) => ({ id: 9, image_path: 'photo9.jpg', ...overrides });

beforeEach(() => {
  vi.clearAllMocks();
  useProfileFilterStore.mockReturnValue(null);
  apiService.getRandomAlbums.mockResolvedValue({ data: [album()] });
  apiService.getRandomArtists.mockResolvedValue({ data: [artist()] });
  apiService.getRandomPhotos.mockResolvedValue({ data: [photo()] });
});

afterEach(() => {
  vi.useRealTimers();
});

describe('mode="music"', () => {
  test('fetches albums and artists filtered by the active profile on mount', async () => {
    useProfileFilterStore.mockReturnValue(3);
    render(<JukeboxScreensaver mode="music" onDismiss={vi.fn()} onView={vi.fn()} />);

    await act(async () => {});

    expect(apiService.getRandomAlbums).toHaveBeenCalledWith(10, 3);
    expect(apiService.getRandomArtists).toHaveBeenCalledWith(10, 3);
    expect(apiService.getRandomPhotos).not.toHaveBeenCalled();
  });

  test('shows the album art first, using the album_page image context', async () => {
    render(<JukeboxScreensaver mode="music" onDismiss={vi.fn()} onView={vi.fn()} />);

    await act(async () => {});

    expect(screen.getByRole('img')).toHaveAttribute('src', 'img:album_page:album1.jpg');
  });

  test('rotates to the next item after 20 seconds, using the artist_page context for an artist', async () => {
    vi.useFakeTimers();
    render(<JukeboxScreensaver mode="music" onDismiss={vi.fn()} onView={vi.fn()} />);
    await act(async () => {});
    expect(screen.getByRole('img')).toHaveAttribute('src', 'img:album_page:album1.jpg');

    await act(async () => { await vi.advanceTimersByTimeAsync(20000); });

    expect(screen.getByRole('img')).toHaveAttribute('src', 'img:artist_page:artist2.jpg');
  });

  test('refetches a fresh pool once the current one is exhausted', async () => {
    vi.useFakeTimers();
    render(<JukeboxScreensaver mode="music" onDismiss={vi.fn()} onView={vi.fn()} />);
    await act(async () => {});
    expect(apiService.getRandomAlbums).toHaveBeenCalledTimes(1);

    await act(async () => { await vi.advanceTimersByTimeAsync(20000); }); // advances to the artist item
    await act(async () => { await vi.advanceTimersByTimeAsync(20000); }); // pool now empty: triggers a refetch

    expect(apiService.getRandomAlbums).toHaveBeenCalledTimes(2);
  });

  test('a change in the active profile filter forces a fresh fetch, discarding the previous pool', async () => {
    useProfileFilterStore.mockReturnValue(1);
    const { rerender } = render(<JukeboxScreensaver mode="music" onDismiss={vi.fn()} onView={vi.fn()} />);
    await act(async () => {});
    expect(apiService.getRandomAlbums).toHaveBeenCalledWith(10, 1);

    useProfileFilterStore.mockReturnValue(2);
    rerender(<JukeboxScreensaver mode="music" onDismiss={vi.fn()} onView={vi.fn()} />);
    await act(async () => {});

    expect(apiService.getRandomAlbums).toHaveBeenLastCalledWith(10, 2);
  });

  test('tapping the background calls onDismiss', async () => {
    const onDismiss = vi.fn();
    render(<JukeboxScreensaver mode="music" onDismiss={onDismiss} onView={vi.fn()} />);
    await act(async () => {});

    fireEvent.click(screen.getByRole('img'));

    expect(onDismiss).toHaveBeenCalledTimes(1);
  });

  test('tapping View calls onView with the current item instead of dismissing', async () => {
    const onDismiss = vi.fn();
    const onView = vi.fn();
    render(<JukeboxScreensaver mode="music" onDismiss={onDismiss} onView={onView} />);
    await act(async () => {});

    fireEvent.click(screen.getByRole('button', { name: /view/i }));

    expect(onView).toHaveBeenCalledWith({ type: 'album', data: album() });
    expect(onDismiss).not.toHaveBeenCalled();
  });

  test('renders nothing when both fetches fail, and does not crash', async () => {
    apiService.getRandomAlbums.mockRejectedValue(new Error('network'));
    apiService.getRandomArtists.mockRejectedValue(new Error('network'));
    const { container } = render(<JukeboxScreensaver mode="music" onDismiss={vi.fn()} onView={vi.fn()} />);

    await act(async () => {});

    expect(container).toBeEmptyDOMElement();
  });

  test('renders nothing when both pools are empty', async () => {
    apiService.getRandomAlbums.mockResolvedValue({ data: [] });
    apiService.getRandomArtists.mockResolvedValue({ data: [] });
    const { container } = render(<JukeboxScreensaver mode="music" onDismiss={vi.fn()} onView={vi.fn()} />);

    await act(async () => {});

    expect(container).toBeEmptyDOMElement();
  });

  test('falls back to the placeholder icon when image_path is missing', async () => {
    apiService.getRandomAlbums.mockResolvedValue({ data: [album({ image_path: null })] });
    render(<JukeboxScreensaver mode="music" onDismiss={vi.fn()} onView={vi.fn()} />);

    await act(async () => {});

    expect(screen.queryByRole('img')).not.toBeInTheDocument();
  });

  test('a malformed item with no name/title still renders a safe View label, not a crash', async () => {
    apiService.getRandomAlbums.mockResolvedValue({ data: [album({ title: undefined })] });
    render(<JukeboxScreensaver mode="music" onDismiss={vi.fn()} onView={vi.fn()} />);

    await act(async () => {});

    expect(screen.getByRole('button', { name: /view/i })).toBeInTheDocument();
  });
});

describe('mode="photos"', () => {
  test('fetches only from getRandomPhotos, never albums/artists', async () => {
    render(<JukeboxScreensaver mode="photos" onDismiss={vi.fn()} onView={vi.fn()} />);

    await act(async () => {});

    expect(apiService.getRandomPhotos).toHaveBeenCalledWith(10);
    expect(apiService.getRandomAlbums).not.toHaveBeenCalled();
    expect(apiService.getRandomArtists).not.toHaveBeenCalled();
  });

  test('renders using the photo_page image context', async () => {
    render(<JukeboxScreensaver mode="photos" onDismiss={vi.fn()} onView={vi.fn()} />);

    await act(async () => {});

    expect(screen.getByRole('img')).toHaveAttribute('src', 'img:photo_page:photo9.jpg');
  });

  test('does not render a View button', async () => {
    render(<JukeboxScreensaver mode="photos" onDismiss={vi.fn()} onView={vi.fn()} />);

    await act(async () => {});

    expect(screen.queryByRole('button', { name: /view/i })).not.toBeInTheDocument();
  });

  test('tapping anywhere still calls onDismiss', async () => {
    const onDismiss = vi.fn();
    render(<JukeboxScreensaver mode="photos" onDismiss={onDismiss} onView={vi.fn()} />);
    await act(async () => {});

    fireEvent.click(screen.getByRole('img'));

    expect(onDismiss).toHaveBeenCalledTimes(1);
  });

  test('renders nothing when the photo pool is empty, and does not crash', async () => {
    apiService.getRandomPhotos.mockResolvedValue({ data: [] });
    const { container } = render(<JukeboxScreensaver mode="photos" onDismiss={vi.fn()} onView={vi.fn()} />);

    await act(async () => {});

    expect(container).toBeEmptyDOMElement();
  });

  test('renders nothing when the photo fetch rejects, and does not crash', async () => {
    apiService.getRandomPhotos.mockRejectedValue(new Error('network'));
    const { container } = render(<JukeboxScreensaver mode="photos" onDismiss={vi.fn()} onView={vi.fn()} />);

    await act(async () => {});

    expect(container).toBeEmptyDOMElement();
  });

  test('rotates to the next photo after 20 seconds', async () => {
    vi.useFakeTimers();
    apiService.getRandomPhotos.mockResolvedValue({ data: [photo({ id: 9, image_path: 'photo9.jpg' }), photo({ id: 10, image_path: 'photo10.jpg' })] });
    render(<JukeboxScreensaver mode="photos" onDismiss={vi.fn()} onView={vi.fn()} />);
    await act(async () => {});
    const first = screen.getByRole('img').getAttribute('src');

    await act(async () => { await vi.advanceTimersByTimeAsync(20000); });

    expect(screen.getByRole('img').getAttribute('src')).not.toBe(first);
  });
});

describe('manual navigation', () => {
  test('Next advances, Prev returns to the earlier item, and neither dismisses', async () => {
    const onDismiss = vi.fn();
    apiService.getRandomPhotos.mockResolvedValue({ data: [photo({ id: 1, image_path: 'a.jpg' }), photo({ id: 2, image_path: 'b.jpg' })] });
    render(<JukeboxScreensaver mode="photos" onDismiss={onDismiss} onView={vi.fn()} />);
    await act(async () => {});
    const first = screen.getByRole('img').getAttribute('src');

    fireEvent.click(screen.getByRole('button', { name: 'Next' }));
    await act(async () => {});
    const second = screen.getByRole('img').getAttribute('src');
    expect(second).not.toBe(first);

    fireEvent.click(screen.getByRole('button', { name: 'Previous' }));
    await act(async () => {});
    expect(screen.getByRole('img')).toHaveAttribute('src', first);
    expect(onDismiss).not.toHaveBeenCalled();
  });
});

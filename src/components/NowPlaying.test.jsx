import { render, screen, fireEvent, act } from '@testing-library/react';
import { MemoryRouter, useNavigate } from 'react-router-dom';
import NowPlaying from './NowPlaying';
import { usePlayerStore } from '../stores/playerStore';

vi.mock('react-router-dom', async (importOriginal) => {
  const actual = await importOriginal();
  return { ...actual, useNavigate: vi.fn() };
});

// Matches the shape every backend route actually returns for a track:
// the album art path lives at the top level (image_path), never nested
// under album.image_path (the nested album object is id/title/artist only).
const track = {
  id: 42, title: 'T', artist: { id: 1, name: 'A' },
  album: { id: 2, title: 'Alb' },
  image_path: 'a.jpg',
};

const renderNP = () => render(<MemoryRouter><NowPlaying /></MemoryRouter>);

beforeEach(() => {
  usePlayerStore.setState({ currentTrack: track, closeDrawer: vi.fn() });
  useNavigate.mockReturnValue(vi.fn());
});

test('shows album art when the current track has an image_path', () => {
  renderNP();
  const img = screen.getByRole('img');
  expect(img.src).toContain('a.jpg');
});

test('falls back to the music-notes icon when the track has no image_path', () => {
  usePlayerStore.setState({ currentTrack: { ...track, image_path: null } });
  renderNP();
  expect(screen.queryByRole('img')).toBeNull();
});

test('clicking the album art opens a lightbox with the larger album_page image', () => {
  renderNP();
  fireEvent.click(screen.getByRole('img'));
  const images = screen.getAllByAltText('Alb');
  expect(images.length).toBe(2); // footer thumbnail + lightbox image
  expect(images[1].src).toContain('a.jpg');
});

test('clicking the lightbox overlay closes it', () => {
  renderNP();
  fireEvent.click(screen.getByRole('img'));
  const images = screen.getAllByAltText('Alb');
  fireEvent.click(images[1].parentElement);
  expect(screen.getAllByAltText('Alb').length).toBe(1);
});

test('the track title has a "go to playlist" tooltip when the current track has a source_playlist', () => {
  usePlayerStore.setState({ currentTrack: { ...track, source_playlist: { id: 7, name: 'Road Trip' } } });
  renderNP();
  expect(screen.getByTitle('go to playlist')).toBeInTheDocument();
});

test('the track title has a "go to album" tooltip when the current track has no source_playlist', () => {
  renderNP();
  expect(screen.getByTitle('go to album')).toBeInTheDocument();
});

test('clicking the track title navigates to the source playlist when present', () => {
  const navigate = vi.fn();
  useNavigate.mockReturnValue(navigate);
  usePlayerStore.setState({ currentTrack: { ...track, source_playlist: { id: 7, name: 'Road Trip' } } });
  renderNP();
  screen.getByTitle('go to playlist').click();
  expect(navigate).toHaveBeenCalledWith('/playlist/7');
});

test('clicking the track title navigates to the album and asks it to scroll to this track', () => {
  const navigate = vi.fn();
  useNavigate.mockReturnValue(navigate);
  renderNP();
  screen.getByTitle('go to album').click();
  expect(navigate).toHaveBeenCalledWith('/album/2', { state: { scrollToTrackId: 42 } });
});

test('clicking the track title closes the queue drawer', () => {
  const closeDrawer = vi.fn();
  usePlayerStore.setState({ closeDrawer });
  renderNP();
  screen.getByTitle('go to album').click();
  expect(closeDrawer).toHaveBeenCalled();
});

test('clicking the artist closes the queue drawer', () => {
  const closeDrawer = vi.fn();
  usePlayerStore.setState({ closeDrawer });
  renderNP();
  screen.getByText('A').click();
  expect(closeDrawer).toHaveBeenCalled();
});

describe('track title includes the artist name (for the mobile bar\'s single-line display)', () => {
  test('appends the artist name after the title', () => {
    renderNP();
    expect(screen.getByTitle('go to album')).toHaveTextContent('T — A');
  });

  test('falls back to "Unknown Artist" when the track has no artist', () => {
    usePlayerStore.setState({ currentTrack: { ...track, artist: null } });
    renderNP();
    expect(screen.getByTitle('go to album')).toHaveTextContent('T — Unknown Artist');
  });
});

describe('has-now-playing body class', () => {
  test('is added while a track is loaded', () => {
    renderNP();
    expect(document.body.classList.contains('has-now-playing')).toBe(true);
  });

  test('is removed once the track clears', () => {
    renderNP();
    expect(document.body.classList.contains('has-now-playing')).toBe(true);
    act(() => usePlayerStore.setState({ currentTrack: null }));
    expect(document.body.classList.contains('has-now-playing')).toBe(false);
  });

  test('is removed on unmount', () => {
    const { unmount } = renderNP();
    expect(document.body.classList.contains('has-now-playing')).toBe(true);
    unmount();
    expect(document.body.classList.contains('has-now-playing')).toBe(false);
  });
});

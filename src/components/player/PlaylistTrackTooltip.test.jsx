import { render, screen } from '@testing-library/react';
import PlaylistTrackTooltip from './PlaylistTrackTooltip';

afterEach(() => {
  Object.defineProperty(window, 'innerWidth', { value: 1024, configurable: true });
  Object.defineProperty(window, 'innerHeight', { value: 768, configurable: true });
});

const track = (overrides = {}) => ({
  id: 1,
  title: 'Song Title',
  duration: 245,
  image_path: 'cover.jpg',
  artist: { id: 5, name: 'The Artist' },
  album: { id: 20, title: 'The Album', release_year: '1999' },
  ...overrides,
});

test('renders artist, album title with year, track title, and duration', () => {
  render(<PlaylistTrackTooltip track={track()} x={10} y={10} />);
  expect(screen.getByText('The Artist')).toBeInTheDocument();
  expect(screen.getByText('The Album (1999)')).toBeInTheDocument();
  expect(screen.getByText('Song Title')).toBeInTheDocument();
  expect(screen.getByText('4:05')).toBeInTheDocument();
});

test('omits the year when release_year is unset', () => {
  render(<PlaylistTrackTooltip track={track({ album: { id: 20, title: 'The Album', release_year: null } })} x={10} y={10} />);
  expect(screen.getByText('The Album')).toBeInTheDocument();
});

test('omits the year when release_year is the "0" sentinel', () => {
  render(<PlaylistTrackTooltip track={track({ album: { id: 20, title: 'The Album', release_year: '0' } })} x={10} y={10} />);
  expect(screen.getByText('The Album')).toBeInTheDocument();
});

test('omits the album line entirely when the track has no album', () => {
  render(<PlaylistTrackTooltip track={track({ album: null })} x={10} y={10} />);
  expect(screen.queryByText(/The Album/)).not.toBeInTheDocument();
});

test('renders the album cover image when image_path is present', () => {
  render(<PlaylistTrackTooltip track={track()} x={10} y={10} />);
  const img = screen.getByRole('img');
  expect(img.src).toContain('cover.jpg');
});

test('renders a blank placeholder instead of an image when image_path is absent', () => {
  render(<PlaylistTrackTooltip track={track({ image_path: null })} x={10} y={10} />);
  expect(screen.queryByRole('img')).not.toBeInTheDocument();
  expect(document.querySelector('.playlist-track-tooltip-art-blank')).toBeInTheDocument();
});

test('portals into document.body', () => {
  const { container } = render(<PlaylistTrackTooltip track={track()} x={10} y={10} />);
  expect(container).toBeEmptyDOMElement();
  expect(document.querySelector('.playlist-track-tooltip')).toBeInTheDocument();
});

test('clamps horizontal position to stay on-screen near the right edge', () => {
  render(<PlaylistTrackTooltip track={track()} x={1000} y={10} />);
  const tooltip = document.querySelector('.playlist-track-tooltip');
  const left = parseInt(window.getComputedStyle(tooltip).left);
  expect(left).toBeLessThanOrEqual(1024 - 10);
});

test('clamps vertical position to stay on-screen near the bottom edge', () => {
  render(<PlaylistTrackTooltip track={track()} x={10} y={760} />);
  const tooltip = document.querySelector('.playlist-track-tooltip');
  const top = parseInt(window.getComputedStyle(tooltip).top);
  expect(top).toBeLessThan(760);
});

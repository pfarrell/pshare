import { screen, fireEvent } from '@testing-library/react';
import GuestHome from './GuestHome';
import { renderGuest } from './testUtils';
import { apiService } from '../../services/api';

vi.mock('../../services/api', () => ({
  apiService: {
    jukeboxSearch: vi.fn(), guestHome: vi.fn(), guestPlaylists: vi.fn(), guestCollections: vi.fn(),
    submitToJukebox: vi.fn(), guestTrackIds: vi.fn(), guestRandomTracks: vi.fn(),
    getImageUrl: (p) => (p ? `/img/${p}` : null),
  },
}));

const renderHome = () => renderGuest(<GuestHome />, { path: '/jukebox/:token', route: '/jukebox/tok' });

beforeEach(() => {
  vi.clearAllMocks();
  apiService.guestHome.mockImplementation((_t, mode) => Promise.resolve({
    data: mode === 'albums'
      ? [{ id: 2, title: 'Arrival', image_path: 'b.jpg', artist: { id: 1, name: 'ABBA' }, track_count: 10 }]
      : [{ id: 1, name: 'ABBA', image_path: 'a.jpg', album_count: 3 }],
  }));
});

test('shows random artists by default and links to their pages', async () => {
  renderHome();
  expect(await screen.findByText('ABBA')).toBeInTheDocument();
  expect(apiService.guestHome).toHaveBeenCalledWith('tok', 'artists');
  expect(screen.getByRole('link', { name: /ABBA/ })).toHaveAttribute('href', '/jukebox/tok/artist/1');
});

test('switching to Albums fetches albums and links to album pages', async () => {
  renderHome();
  await screen.findByText('ABBA');
  fireEvent.click(screen.getByRole('button', { name: 'Albums' }));
  expect(await screen.findByText('Arrival')).toBeInTheDocument();
  expect(apiService.guestHome).toHaveBeenLastCalledWith('tok', 'albums');
  expect(screen.getByRole('link', { name: /Arrival/ })).toHaveAttribute('href', '/jukebox/tok/album/2');
});

test('a 404 from home means the QR link is no longer valid', async () => {
  apiService.guestHome.mockRejectedValue({ response: { status: 404 } });
  renderHome();
  expect(await screen.findByText(/no longer valid/i)).toBeInTheDocument();
});

test('a null artist on an album card does not crash', async () => {
  apiService.guestHome.mockResolvedValue({ data: [{ id: 3, title: 'Mystery', image_path: null, artist: null, track_count: 0 }] });
  renderHome();
  fireEvent.click(await screen.findByRole('button', { name: 'Albums' }));
  expect(await screen.findByText('Mystery')).toBeInTheDocument();
  expect(screen.queryByText(/undefined|\[object/)).not.toBeInTheDocument();
});

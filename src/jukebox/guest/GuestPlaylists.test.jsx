import { screen, fireEvent, waitFor } from '@testing-library/react';
import GuestPlaylists from './GuestPlaylists';
import { renderGuest } from './testUtils';
import { apiService } from '../../services/api';

vi.mock('../../services/api', () => ({
  apiService: {
    jukeboxSearch: vi.fn(), guestHome: vi.fn(), guestPlaylists: vi.fn(), guestCollections: vi.fn(),
    submitToJukebox: vi.fn(), guestTrackIds: vi.fn(), guestRandomTracks: vi.fn(),
    getImageUrl: (p) => (p ? `/img/${p}` : null),
  },
}));

beforeEach(() => {
  vi.clearAllMocks();
  localStorage.setItem('jukebox-guest-name', 'Riley');
  apiService.guestPlaylists.mockResolvedValue({ data: [
    { id: 3, name: 'Party', image_path: null, track_count: 12, preview_albums: [{ id: 9, image_path: 'x.jpg' }] },
    { id: 4, name: 'Solo', image_path: null, track_count: 1, preview_albums: [] },
  ] });
  apiService.guestTrackIds.mockResolvedValue({ data: { trackIds: [1, 2] } });
  apiService.guestRandomTracks.mockResolvedValue({ data: { trackIds: [1, 2] } });
  apiService.submitToJukebox.mockResolvedValue({ data: [] });
});

const renderList = () => renderGuest(<GuestPlaylists />, { path: '/jukebox/:token/playlists', route: '/jukebox/tok/playlists' });

test('lists playlists with links', async () => {
  renderList();
  expect(await screen.findByText('Party')).toBeInTheDocument();
  expect(screen.getByRole('link', { name: /Party/ })).toHaveAttribute('href', '/jukebox/tok/playlist/3');
});

test('the add button resolves ids the right way for this kind and submits them', async () => {
  renderList();
  await screen.findByText('Party');
  fireEvent.click(screen.getByRole('button', { name: 'Add Party to queue' }));
  await waitFor(() => expect(apiService.guestTrackIds).toHaveBeenCalledWith('tok', 'playlist', 3));
  await waitFor(() => expect(apiService.submitToJukebox).toHaveBeenCalledWith('tok', [1, 2], 'Riley'));
});

test('an empty list shows a message', async () => {
  apiService.guestPlaylists.mockResolvedValue({ data: [] });
  renderList();
  expect(await screen.findByText(/no playlists/i)).toBeInTheDocument();
});

test('shows the track count with correct pluralization', async () => {
  renderList();
  expect(await screen.findByText('12 tracks')).toBeInTheDocument();
  expect(screen.getByText('1 track')).toBeInTheDocument();
});

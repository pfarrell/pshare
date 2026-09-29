import { screen, fireEvent, waitFor } from '@testing-library/react';
import GuestCollections from './GuestCollections';
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
  apiService.guestCollections.mockResolvedValue({ data: [
    { id: 4, name: 'Seventies', image_path: null, preview_albums: [{ id: 9, image_path: 'x.jpg' }] },
    { id: 5, name: 'Eighties', image_path: null, preview_albums: [] },
  ] });
  apiService.guestTrackIds.mockResolvedValue({ data: { trackIds: [1, 2] } });
  apiService.guestRandomTracks.mockResolvedValue({ data: { trackIds: [1, 2] } });
  apiService.submitToJukebox.mockResolvedValue({ data: [] });
});

const renderList = () => renderGuest(<GuestCollections />, { path: '/jukebox/:token/collections', route: '/jukebox/tok/collections' });

test('lists collections with links', async () => {
  renderList();
  expect(await screen.findByText('Seventies')).toBeInTheDocument();
  expect(screen.getByRole('link', { name: /Seventies/ })).toHaveAttribute('href', '/jukebox/tok/collection/4');
});

test('the add button resolves ids the right way for this kind and submits them', async () => {
  renderList();
  await screen.findByText('Seventies');
  fireEvent.click(screen.getByRole('button', { name: 'Add random tracks from Seventies' }));
  await waitFor(() => expect(apiService.guestRandomTracks).toHaveBeenCalledWith('tok', 'collection', 4));
  await waitFor(() => expect(apiService.submitToJukebox).toHaveBeenCalledWith('tok', [1, 2], 'Riley'));
});

test('an empty list shows a message', async () => {
  apiService.guestCollections.mockResolvedValue({ data: [] });
  renderList();
  expect(await screen.findByText(/no collections/i)).toBeInTheDocument();
});

import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import GuestApp from './GuestApp';

vi.mock('../../services/api', () => ({
  apiService: {
    submitToJukebox: vi.fn(), jukeboxSearch: vi.fn(), guestHome: vi.fn(), guestArtist: vi.fn(), guestAlbum: vi.fn(),
    guestPlaylist: vi.fn(), guestCollection: vi.fn(), guestPlaylists: vi.fn(), guestCollections: vi.fn(), guestTrackIds: vi.fn(), guestRandomTracks: vi.fn(),
    getImageUrl: (p) => (p ? `/img/${p}` : null),
  },
}));
import { apiService } from '../../services/api';

const renderApp = (route = '/jukebox/tok') =>
  render(<MemoryRouter initialEntries={[route]}><GuestApp token="tok" /></MemoryRouter>);

beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
  apiService.guestHome.mockResolvedValue({ data: [] });
});

test('prompts for a name first, then shows the app, and does not prompt again on remount', async () => {
  renderApp();
  expect(screen.getByPlaceholderText(/your name/i)).toBeInTheDocument();
  expect(screen.queryByPlaceholderText('Search')).not.toBeInTheDocument();

  fireEvent.change(screen.getByPlaceholderText(/your name/i), { target: { value: 'Riley' } });
  fireEvent.click(screen.getByRole('button', { name: /continue/i }));
  await waitFor(() => expect(screen.getByPlaceholderText('Search')).toBeInTheDocument());
  expect(localStorage.getItem('jukebox-guest-name')).toBe('Riley');

  renderApp();
  expect(screen.queryAllByPlaceholderText(/your name/i)).toHaveLength(0);
});

test('a whitespace-only name is not accepted', () => {
  renderApp();
  fireEvent.change(screen.getByPlaceholderText(/your name/i), { target: { value: '   ' } });
  fireEvent.click(screen.getByRole('button', { name: /continue/i }));
  expect(screen.getByPlaceholderText(/your name/i)).toBeInTheDocument();
});

test('an unknown guest sub-route shows a way back home instead of a blank page', () => {
  localStorage.setItem('jukebox-guest-name', 'Riley');
  renderApp('/jukebox/tok/nope/nothing');
  expect(screen.getByRole('link', { name: /home/i })).toHaveAttribute('href', '/jukebox/tok');
});

test('remembers the jukebox token so the main app can offer Send to Jukebox and its remote', () => {
  renderApp();
  expect(localStorage.getItem('jukebox-enqueue-token')).toBe('tok');
});

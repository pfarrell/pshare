import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import SpotifyConnectionCard from './SpotifyConnectionCard';
import { apiService } from '../services/api';

vi.mock('../services/api', () => ({
  apiService: {
    getSpotifyStatus: vi.fn(),
    disconnectSpotify: vi.fn(),
    spotifyConnectUrl: (target, deviceId) =>
      `/api/auth/spotify/start?target=${target}${deviceId != null ? `&deviceId=${deviceId}` : ''}`,
  },
}));

const renderCard = (entry = '/account') =>
  render(
    <MemoryRouter initialEntries={[entry]}>
      <SpotifyConnectionCard />
    </MemoryRouter>
  );

const status = (overrides = {}) => ({
  data: { allowed: true, connected: false, devices: [], ...overrides },
});

beforeEach(() => {
  vi.clearAllMocks();
});

describe('SpotifyConnectionCard', () => {
  test('renders nothing when status.allowed is false', async () => {
    apiService.getSpotifyStatus.mockResolvedValue(status({ allowed: false }));
    const { container } = renderCard();
    await waitFor(() => expect(apiService.getSpotifyStatus).toHaveBeenCalled());
    await Promise.resolve();
    expect(container).toBeEmptyDOMElement();
  });

  test('renders nothing when the status request fails', async () => {
    apiService.getSpotifyStatus.mockRejectedValue(new Error('boom'));
    const { container } = renderCard();
    await waitFor(() => expect(apiService.getSpotifyStatus).toHaveBeenCalled());
    await Promise.resolve();
    expect(container).toBeEmptyDOMElement();
  });

  test('shows "Connect Spotify" linking to spotifyConnectUrl(user) when not connected', async () => {
    apiService.getSpotifyStatus.mockResolvedValue(status());
    renderCard();
    const link = await screen.findByText('Connect Spotify');
    expect(link.closest('a')).toHaveAttribute('href', apiService.spotifyConnectUrl('user'));
  });

  test('shows "Disconnect" when connected and calls disconnectSpotify(user) then refetches', async () => {
    apiService.getSpotifyStatus
      .mockResolvedValueOnce(status({ connected: true }))
      .mockResolvedValueOnce(status({ connected: false }));
    apiService.disconnectSpotify.mockResolvedValue({});
    renderCard();
    fireEvent.click(await screen.findByText('Disconnect'));
    await waitFor(() => expect(apiService.disconnectSpotify).toHaveBeenCalledWith('user'));
    await screen.findByText('Connect Spotify');
    expect(apiService.getSpotifyStatus).toHaveBeenCalledTimes(2);
  });

  test('lists each jukebox device with its own Connect/Disconnect', async () => {
    apiService.getSpotifyStatus.mockResolvedValue(
      status({
        devices: [
          { id: 7, name: 'Kitchen', connected: false },
          { id: 9, name: 'Den', connected: true },
        ],
      })
    );
    apiService.disconnectSpotify.mockResolvedValue({});
    renderCard();
    expect(await screen.findByText('Jukebox: Kitchen')).toBeInTheDocument();
    expect(screen.getByText('Jukebox: Den')).toBeInTheDocument();
    const connect = screen.getAllByText('Connect Spotify').find((el) => el.closest('a')?.getAttribute('href').includes('deviceId=7'));
    expect(connect.closest('a')).toHaveAttribute('href', apiService.spotifyConnectUrl('device', 7));
    fireEvent.click(screen.getByText('Disconnect'));
    await waitFor(() => expect(apiService.disconnectSpotify).toHaveBeenCalledWith('device', 9));
  });

  test("shows \"That Spotify account isn't Premium\" when the URL has ?spotify=not_premium", async () => {
    apiService.getSpotifyStatus.mockResolvedValue(status());
    renderCard('/account?spotify=not_premium');
    expect(await screen.findByText("That Spotify account isn't Premium")).toBeInTheDocument();
  });

  test('shows "Couldn\'t connect Spotify. Try again." for ?spotify=failed', async () => {
    apiService.getSpotifyStatus.mockResolvedValue(status());
    renderCard('/account?spotify=failed');
    expect(await screen.findByText("Couldn't connect Spotify. Try again.")).toBeInTheDocument();
  });
});

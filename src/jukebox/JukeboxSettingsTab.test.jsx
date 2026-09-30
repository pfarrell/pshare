import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import JukeboxSettingsTab from './JukeboxSettingsTab';
import { __resetProfilesCacheForTests, invalidateProfilesCache } from '../utils/profilesCache';
import { useProfileFilterStore } from '../stores/profileFilterStore';
import { useJukeboxScreensaverStore } from '../stores/jukeboxScreensaverStore';
import { useAuthStore } from '../stores/authStore';
import { apiService } from '../services/api';

vi.mock('../services/api', () => ({
  apiService: { getProfiles: vi.fn() },
}));

vi.mock('qrcode', () => ({
  default: { toDataURL: vi.fn(() => Promise.resolve('data:image/png;base64,fake')) },
}));

beforeEach(() => {
  vi.clearAllMocks();
  __resetProfilesCacheForTests();
  useProfileFilterStore.setState({ activeProfileId: null });
  useJukeboxScreensaverStore.setState({ mode: 'music' });
  useAuthStore.setState({ jukeboxDeviceId: 5, jukeboxEnqueueToken: 'tok-abc' });
  apiService.getProfiles.mockResolvedValue({ data: [{ id: 1, name: 'Kids', tags: [] }] });
});

describe('JukeboxSettingsTab', () => {
  test('fetches and shows the profile list as soon as it is rendered — no open/close step of its own', async () => {
    render(<JukeboxSettingsTab />);
    await waitFor(() => expect(screen.getByText('Kids')).toBeInTheDocument());
  });

  test('selecting a profile applies it and stays showing, highlighted', async () => {
    render(<JukeboxSettingsTab />);
    await waitFor(() => screen.getByText('Kids'));

    fireEvent.click(screen.getByRole('button', { name: 'Kids' }));

    expect(useProfileFilterStore.getState().activeProfileId).toBe(1);
    expect(screen.getByRole('button', { name: 'Kids' })).toHaveAttribute('aria-pressed', 'true');
  });

  test('shows the QR code together with the profile list and screensaver selector', async () => {
    render(<JukeboxSettingsTab />);
    await waitFor(() => expect(screen.getByRole('img', { name: /qr code/i })).toBeInTheDocument());
    expect(screen.getByText('Kids')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Music' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /show qr code/i })).not.toBeInTheDocument();
  });

  test('refetches the profile list after an external invalidate while mounted', async () => {
    render(<JukeboxSettingsTab />);
    await waitFor(() => screen.getByText('Kids'));
    expect(apiService.getProfiles).toHaveBeenCalledTimes(1);

    apiService.getProfiles.mockResolvedValue({ data: [{ id: 2, name: 'Adults', tags: [] }] });
    invalidateProfilesCache();

    await waitFor(() => expect(screen.getByText('Adults')).toBeInTheDocument());
    expect(apiService.getProfiles).toHaveBeenCalledTimes(2);
    expect(screen.queryByText('Kids')).not.toBeInTheDocument();
  });
});

describe('screensaver mode selector', () => {
  test('shows Music as pressed by default', async () => {
    render(<JukeboxSettingsTab />);
    await waitFor(() => screen.getByText('Kids'));

    expect(screen.getByRole('button', { name: 'Music' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: 'Off' })).toHaveAttribute('aria-pressed', 'false');
    expect(screen.getByRole('button', { name: 'Photos' })).toHaveAttribute('aria-pressed', 'false');
  });

  test('tapping Photos switches the mode and updates the store', async () => {
    render(<JukeboxSettingsTab />);
    await waitFor(() => screen.getByText('Kids'));

    fireEvent.click(screen.getByRole('button', { name: 'Photos' }));

    expect(screen.getByRole('button', { name: 'Photos' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: 'Music' })).toHaveAttribute('aria-pressed', 'false');
    expect(useJukeboxScreensaverStore.getState().mode).toBe('photos');
  });

  test('tapping Off switches the mode and updates the store', async () => {
    render(<JukeboxSettingsTab />);
    await waitFor(() => screen.getByText('Kids'));

    fireEvent.click(screen.getByRole('button', { name: 'Off' }));

    expect(screen.getByRole('button', { name: 'Off' })).toHaveAttribute('aria-pressed', 'true');
    expect(useJukeboxScreensaverStore.getState().mode).toBe('off');
  });

  test('reflects a persisted photos mode', async () => {
    useJukeboxScreensaverStore.setState({ mode: 'photos' });
    render(<JukeboxSettingsTab />);
    await waitFor(() => screen.getByText('Kids'));

    expect(screen.getByRole('button', { name: 'Photos' })).toHaveAttribute('aria-pressed', 'true');
  });

  test('the mode buttons are visually and structurally separated from the profile filter list, not styled as filter options', async () => {
    render(<JukeboxSettingsTab />);
    await waitFor(() => screen.getByText('Kids'));

    const musicButton = screen.getByRole('button', { name: 'Music' });
    const allButton = screen.getByRole('button', { name: 'All' });

    expect(musicButton).toHaveClass('jukebox-settings-tab-screensaver-toggle');
    expect(musicButton.parentElement).not.toBe(allButton.parentElement);
  });

  describe('Exit kiosk', () => {
    afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });

    test('first tap only arms the confirm; nothing is sent', () => {
      const fetchMock = vi.fn();
      vi.stubGlobal('fetch', fetchMock);
      render(<JukeboxSettingsTab />);

      fireEvent.click(screen.getByRole('button', { name: 'Exit kiosk' }));

      expect(screen.getByRole('button', { name: 'Tap again to confirm' })).toBeInTheDocument();
      expect(fetchMock).not.toHaveBeenCalled();
    });

    test('second tap posts to the local kiosk helper', async () => {
      const fetchMock = vi.fn().mockResolvedValue({ ok: true });
      vi.stubGlobal('fetch', fetchMock);
      render(<JukeboxSettingsTab />);

      fireEvent.click(screen.getByRole('button', { name: 'Exit kiosk' }));
      fireEvent.click(screen.getByRole('button', { name: 'Tap again to confirm' }));

      expect(fetchMock).toHaveBeenCalledWith('http://127.0.0.1:8737/exit-kiosk', { method: 'POST' });
    });

    test('the confirm disarms itself after a few seconds', () => {
      vi.useFakeTimers();
      render(<JukeboxSettingsTab />);

      fireEvent.click(screen.getByRole('button', { name: 'Exit kiosk' }));
      act(() => { vi.advanceTimersByTime(3100); });

      expect(screen.getByRole('button', { name: 'Exit kiosk' })).toBeInTheDocument();
    });

    test('shows an error when the helper is unreachable', async () => {
      vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Failed to fetch')));
      render(<JukeboxSettingsTab />);

      fireEvent.click(screen.getByRole('button', { name: 'Exit kiosk' }));
      fireEvent.click(screen.getByRole('button', { name: 'Tap again to confirm' }));

      expect(await screen.findByText('Kiosk helper not running')).toBeInTheDocument();
    });
  });
});

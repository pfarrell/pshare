import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import JukeboxSettingsTab from './JukeboxSettingsTab';
import { __resetProfilesCacheForTests, invalidateProfilesCache } from '../utils/profilesCache';
import { useProfileFilterStore } from '../stores/profileFilterStore';
import { useAuthStore } from '../stores/authStore';
import { apiService } from '../services/api';

vi.mock('../services/api', () => ({
  apiService: { getProfiles: vi.fn(), rotateJukeboxToken: vi.fn() },
}));

vi.mock('qrcode', () => ({
  default: { toDataURL: vi.fn(() => Promise.resolve('data:image/png;base64,fake')) },
}));

beforeEach(() => {
  vi.clearAllMocks();
  __resetProfilesCacheForTests();
  useProfileFilterStore.setState({ activeProfileId: null });
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

  test('shows a "Show QR code" entry alongside the profile list', async () => {
    render(<JukeboxSettingsTab />);
    await waitFor(() => screen.getByText('Kids'));

    expect(screen.getByRole('button', { name: /show qr code/i })).toBeInTheDocument();
  });

  test('tapping "Show QR code" swaps to the QR view and back', async () => {
    render(<JukeboxSettingsTab />);
    await waitFor(() => screen.getByText('Kids'));

    fireEvent.click(screen.getByRole('button', { name: /show qr code/i }));
    await waitFor(() => expect(screen.getByRole('img', { name: /qr code/i })).toBeInTheDocument());
    expect(screen.queryByText('Kids')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /back/i }));
    await waitFor(() => expect(screen.getByText('Kids')).toBeInTheDocument());
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

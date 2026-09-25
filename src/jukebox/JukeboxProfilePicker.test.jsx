import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import JukeboxProfilePicker from './JukeboxProfilePicker';
import { useProfileFilterStore } from '../stores/profileFilterStore';
import { apiService } from '../services/api';

vi.mock('../services/api', () => ({ apiService: { getProfiles: vi.fn() } }));

beforeEach(() => {
  vi.clearAllMocks();
  useProfileFilterStore.setState({ activeProfileId: null });
  apiService.getProfiles.mockResolvedValue({ data: [{ id: 1, name: 'Kids', tags: [] }] });
});

describe('JukeboxProfilePicker', () => {
  test('starts closed, opens on tapping the gear button', async () => {
    render(<JukeboxProfilePicker />);
    expect(screen.queryByText('Kids')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /profile settings/i }));

    await waitFor(() => expect(screen.getByText('Kids')).toBeInTheDocument());
  });

  test('selecting a profile applies it and stays open, highlighted', async () => {
    render(<JukeboxProfilePicker />);
    fireEvent.click(screen.getByRole('button', { name: /profile settings/i }));
    await waitFor(() => screen.getByText('Kids'));

    fireEvent.click(screen.getByRole('button', { name: 'Kids' }));

    expect(useProfileFilterStore.getState().activeProfileId).toBe(1);
    expect(screen.getByText('Kids')).toBeInTheDocument(); // popover still open
    expect(screen.getByRole('button', { name: 'Kids' })).toHaveAttribute('aria-pressed', 'true');
  });

  test('a close control dismisses the popover', async () => {
    render(<JukeboxProfilePicker />);
    fireEvent.click(screen.getByRole('button', { name: /profile settings/i }));
    await waitFor(() => screen.getByText('Kids'));

    fireEvent.click(screen.getByRole('button', { name: /close/i }));

    expect(screen.queryByText('Kids')).not.toBeInTheDocument();
  });
});

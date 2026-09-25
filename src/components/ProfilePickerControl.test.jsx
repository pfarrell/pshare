// src/components/ProfilePickerControl.test.jsx
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import ProfilePickerControl from './ProfilePickerControl';
import { __resetProfilesCacheForTests } from '../utils/profilesCache';
import { useProfileFilterStore } from '../stores/profileFilterStore';
import { apiService } from '../services/api';
import toast from 'react-hot-toast';

vi.mock('../services/api', () => ({
  apiService: {
    getProfiles: vi.fn(),
    setDefaultProfile: vi.fn(),
  },
}));

vi.mock('react-hot-toast', () => ({
  default: { success: vi.fn(), error: vi.fn() },
}));

beforeEach(() => {
  vi.clearAllMocks();
  __resetProfilesCacheForTests();
  useProfileFilterStore.setState({ activeProfileId: null });
  apiService.getProfiles.mockResolvedValue({
    data: [{ id: 1, name: 'Kids', tags: [] }, { id: 2, name: 'Focus', tags: [] }],
  });
});

describe('ProfilePickerControl', () => {
  test('lists "All" plus every profile', async () => {
    render(<ProfilePickerControl />);
    await waitFor(() => expect(screen.getByText('Kids')).toBeInTheDocument());
    expect(screen.getByText('Focus')).toBeInTheDocument();
    expect(screen.getByText('All')).toBeInTheDocument();
  });

  test('"All" is marked selected when no profile is active', async () => {
    render(<ProfilePickerControl />);
    await waitFor(() => expect(screen.getByText('Kids')).toBeInTheDocument());
    expect(screen.getByRole('button', { name: 'All' })).toHaveAttribute('aria-pressed', 'true');
  });

  test('selecting a profile calls setProfile and onSelect', async () => {
    const onSelect = vi.fn();
    render(<ProfilePickerControl onSelect={onSelect} />);
    await waitFor(() => screen.getByText('Kids'));

    fireEvent.click(screen.getByRole('button', { name: 'Kids' }));

    expect(useProfileFilterStore.getState().activeProfileId).toBe(1);
    expect(onSelect).toHaveBeenCalled();
  });

  test('selecting All clears the active profile', async () => {
    useProfileFilterStore.setState({ activeProfileId: 1 });
    render(<ProfilePickerControl />);
    await waitFor(() => screen.getByText('Kids'));

    fireEvent.click(screen.getByRole('button', { name: 'All' }));

    expect(useProfileFilterStore.getState().activeProfileId).toBeNull();
  });

  test('does not show "set default" unless allowSetDefault is true', async () => {
    render(<ProfilePickerControl />);
    await waitFor(() => screen.getByText('Kids'));
    expect(screen.queryByText('set default')).not.toBeInTheDocument();
  });

  test('clicking "set default" saves the active profile', async () => {
    useProfileFilterStore.setState({ activeProfileId: 1 });
    apiService.setDefaultProfile.mockResolvedValue({});
    render(<ProfilePickerControl allowSetDefault />);
    await waitFor(() => screen.getByText('Kids'));

    fireEvent.click(screen.getByText('set default'));

    await waitFor(() => expect(apiService.setDefaultProfile).toHaveBeenCalledWith(1));
    expect(toast.success).toHaveBeenCalledWith('Default profile set to Kids');
  });
});

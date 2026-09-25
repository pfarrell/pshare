import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import ProfileFilterChip from './ProfileFilterChip';
import { useProfileFilterStore } from '../stores/profileFilterStore';
import { apiService } from '../services/api';

vi.mock('../services/api', () => ({ apiService: { getProfiles: vi.fn() } }));

beforeEach(() => {
  vi.clearAllMocks();
  useProfileFilterStore.setState({ activeProfileId: null });
  apiService.getProfiles.mockResolvedValue({ data: [{ id: 1, name: 'Kids', tags: [] }] });
});

describe('ProfileFilterChip', () => {
  test('renders nothing visible for the profile name when All is active, but the trigger still shows', () => {
    render(<ProfileFilterChip />);
    expect(screen.queryByText('Kids')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /profile/i })).toBeInTheDocument();
  });

  test('shows the active profile name on the trigger once loaded', async () => {
    useProfileFilterStore.setState({ activeProfileId: 1 });
    render(<ProfileFilterChip />);
    await waitFor(() => expect(screen.getByText('Kids')).toBeInTheDocument());
  });

  test('clicking the trigger opens the picker popover', async () => {
    render(<ProfileFilterChip />);
    fireEvent.click(screen.getByRole('button', { name: /profile/i }));
    await waitFor(() => expect(screen.getByRole('button', { name: 'All' })).toBeInTheDocument());
  });

  test('clicking outside closes the popover', async () => {
    render(<div><ProfileFilterChip /><div data-testid="outside" /></div>);
    fireEvent.click(screen.getByRole('button', { name: /profile/i }));
    await waitFor(() => screen.getByRole('button', { name: 'All' }));

    fireEvent.mouseDown(screen.getByTestId('outside'));

    expect(screen.queryByRole('button', { name: 'All' })).not.toBeInTheDocument();
  });

  test('selecting a profile in the popover closes it', async () => {
    render(<ProfileFilterChip />);
    fireEvent.click(screen.getByRole('button', { name: /profile/i }));
    await waitFor(() => screen.getByText('Kids'));

    fireEvent.click(screen.getByRole('button', { name: 'Kids' }));

    expect(screen.queryByRole('button', { name: 'All' })).not.toBeInTheDocument();
  });
});

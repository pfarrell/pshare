import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import ProfileFilterChip from './ProfileFilterChip';
import { __resetProfilesCacheForTests } from '../utils/profilesCache';
import { useProfileFilterStore } from '../stores/profileFilterStore';
import { apiService } from '../services/api';

vi.mock('../services/api', () => ({ apiService: { getProfiles: vi.fn() } }));

beforeEach(() => {
  vi.clearAllMocks();
  __resetProfilesCacheForTests();
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

  test('the trigger reads "Filter", not "Profile", when nothing is active', () => {
    render(<ProfileFilterChip />);
    expect(screen.getByRole('button', { name: /profile filter/i })).toHaveTextContent('Filter');
  });

  test('clears an active profile id that no longer exists in the fetched list', async () => {
    useProfileFilterStore.setState({ activeProfileId: 99 });
    render(<ProfileFilterChip />);

    await waitFor(() => expect(useProfileFilterStore.getState().activeProfileId).toBeNull());
  });

  test('keeps an active profile id that is still present in the fetched list', async () => {
    useProfileFilterStore.setState({ activeProfileId: 1 });
    render(<ProfileFilterChip />);

    await waitFor(() => expect(screen.getByText('Kids')).toBeInTheDocument());
    expect(useProfileFilterStore.getState().activeProfileId).toBe(1);
  });

  test('selecting a profile in the popover closes it', async () => {
    render(<ProfileFilterChip />);
    fireEvent.click(screen.getByRole('button', { name: /profile/i }));
    await waitFor(() => screen.getByText('Kids'));

    fireEvent.click(screen.getByRole('button', { name: 'Kids' }));

    expect(screen.queryByRole('button', { name: 'All' })).not.toBeInTheDocument();
  });
});

import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import AdminDuplicateTracks from './AdminDuplicateTracks';
import { apiService } from '../services/api';

vi.mock('../services/api', () => ({
  apiService: {
    getDuplicateTracks: vi.fn(),
    resolveDuplicateTrack: vi.fn(),
    dismissDuplicate: vi.fn(),
  },
}));

const renderPage = () => render(<MemoryRouter><AdminDuplicateTracks /></MemoryRouter>);

const pair = {
  tier: 1,
  a: { id: 100, title: 'I Touch Myself', duration_sec: 226, album_id: 5, album_title: 'Greatest Hits of the 90s' },
  b: { id: 200, title: 'I touch Myself', duration_sec: 227, album_id: 5, album_title: 'Greatest Hits of the 90s' },
};

beforeEach(() => {
  vi.spyOn(window, 'confirm').mockReturnValue(true);
});

describe('AdminDuplicateTracks', () => {
  test('shows an empty state when there are no candidate pairs', async () => {
    apiService.getDuplicateTracks.mockResolvedValue({ data: { pairs: [], pagination: { page: 1, limit: 25, total: 0, totalPages: 1 } } });
    renderPage();

    await screen.findByText('No possible duplicate tracks found.');
  });

  test('renders both tracks in a pair with the tier label and album context', async () => {
    apiService.getDuplicateTracks.mockResolvedValue({ data: { pairs: [pair], pagination: { page: 1, limit: 25, total: 1, totalPages: 1 } } });
    renderPage();

    await screen.findByText('I Touch Myself');
    expect(screen.getByText('I touch Myself')).toBeInTheDocument();
    expect(screen.getByText(/Same audio file/)).toBeInTheDocument();
    expect(screen.getByText(/Greatest Hits of the 90s/)).toBeInTheDocument();
  });

  test('merging keeps the chosen track and removes the pair from the list', async () => {
    const user = userEvent.setup();
    apiService.getDuplicateTracks.mockResolvedValue({ data: { pairs: [pair], pagination: { page: 1, limit: 25, total: 1, totalPages: 1 } } });
    apiService.resolveDuplicateTrack.mockResolvedValue({ data: { success: true } });
    renderPage();

    await screen.findByText('I Touch Myself');
    const leftCard = screen.getByText('I Touch Myself').closest('div');
    await user.click(within(leftCard).getByText('Keep this, merge the other in'));

    expect(apiService.resolveDuplicateTrack).toHaveBeenCalledWith(100, 200);
    expect(screen.queryByText('I touch Myself')).not.toBeInTheDocument();
  });

  test('dismissing a pair calls dismissDuplicate and removes it from the list', async () => {
    const user = userEvent.setup();
    apiService.getDuplicateTracks.mockResolvedValue({ data: { pairs: [pair], pagination: { page: 1, limit: 25, total: 1, totalPages: 1 } } });
    apiService.dismissDuplicate.mockResolvedValue({ data: { success: true } });
    renderPage();

    await screen.findByText('I Touch Myself');
    await user.click(screen.getByText('Not a duplicate'));

    expect(apiService.dismissDuplicate).toHaveBeenCalledWith('track', 100, 200);
    expect(screen.queryByText('I Touch Myself')).not.toBeInTheDocument();
  });
});

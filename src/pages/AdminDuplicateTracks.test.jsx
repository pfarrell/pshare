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
  a: { id: 100, title: 'I Touch Myself', duration_sec: 226, album_id: 5, album_title: 'Greatest Hits of the 90s', url: 'http://localhost:3000/stream/100' },
  b: { id: 200, title: 'I touch Myself', duration_sec: 227, album_id: 5, album_title: 'Greatest Hits of the 90s', url: 'http://localhost:3000/stream/200' },
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

  test('renders both tracks in a pair with the tier label, album context, and a link to the source album', async () => {
    apiService.getDuplicateTracks.mockResolvedValue({ data: { pairs: [pair], pagination: { page: 1, limit: 25, total: 1, totalPages: 1 } } });
    renderPage();

    const linkA = await screen.findByRole('link', { name: /I Touch Myself/ });
    expect(linkA).toHaveAttribute('href', '/album/5');
    expect(linkA).toHaveAttribute('target', '_blank');
    expect(screen.getByRole('link', { name: /I touch Myself/ })).toHaveAttribute('href', '/album/5');
    expect(screen.getByText(/Same audio file/)).toBeInTheDocument();
    expect(screen.getByText(/Greatest Hits of the 90s/)).toBeInTheDocument();
  });

  test('preview reveals an audio player pointed at the track stream url', async () => {
    const user = userEvent.setup();
    apiService.getDuplicateTracks.mockResolvedValue({ data: { pairs: [pair], pagination: { page: 1, limit: 25, total: 1, totalPages: 1 } } });
    renderPage();

    await screen.findByRole('link', { name: /I Touch Myself/ });
    const leftCard = screen.getByRole('link', { name: /I Touch Myself/ }).closest('div');
    await user.click(within(leftCard).getByText('Preview'));

    const audio = leftCard.querySelector('audio');
    expect(audio).toHaveAttribute('src', 'http://localhost:3000/stream/100');
  });

  test('merging keeps the chosen track and removes the pair from the list', async () => {
    const user = userEvent.setup();
    apiService.getDuplicateTracks.mockResolvedValue({ data: { pairs: [pair], pagination: { page: 1, limit: 25, total: 1, totalPages: 1 } } });
    apiService.resolveDuplicateTrack.mockResolvedValue({ data: { success: true } });
    renderPage();

    await screen.findByRole('link', { name: /I Touch Myself/ });
    const leftCard = screen.getByRole('link', { name: /I Touch Myself/ }).closest('div');
    await user.click(within(leftCard).getByText('Keep this, delete the other'));

    expect(apiService.resolveDuplicateTrack).toHaveBeenCalledWith(100, 200);
    expect(window.confirm).toHaveBeenCalledWith(expect.stringContaining('Delete "I touch Myself" and keep "I Touch Myself"'));
    expect(screen.queryByRole('link', { name: /I touch Myself/ })).not.toBeInTheDocument();
  });

  test('dismissing a pair calls dismissDuplicate and removes it from the list', async () => {
    const user = userEvent.setup();
    apiService.getDuplicateTracks.mockResolvedValue({ data: { pairs: [pair], pagination: { page: 1, limit: 25, total: 1, totalPages: 1 } } });
    apiService.dismissDuplicate.mockResolvedValue({ data: { success: true } });
    renderPage();

    await screen.findByRole('link', { name: /I Touch Myself/ });
    await user.click(screen.getByText('Not a duplicate'));

    expect(apiService.dismissDuplicate).toHaveBeenCalledWith('track', 100, 200);
    expect(screen.queryByRole('link', { name: /I Touch Myself/ })).not.toBeInTheDocument();
  });
});

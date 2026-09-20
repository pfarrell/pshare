import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import AdminDuplicateAlbums from './AdminDuplicateAlbums';
import { apiService } from '../services/api';

vi.mock('../services/api', () => ({
  apiService: {
    getDuplicateAlbums: vi.fn(),
    resolveDuplicateAlbum: vi.fn(),
    dismissDuplicate: vi.fn(),
  },
}));

const renderPage = () => render(<MemoryRouter><AdminDuplicateAlbums /></MemoryRouter>);

const pair = {
  tier: 1,
  a: { id: 10, title: 'Greatest Hits', release_year: '1999', image_path: null, artist_name: 'Test Artist' },
  b: { id: 20, title: 'Greatest Hits (Remaster)', release_year: '2005', image_path: null, artist_name: 'Test Artist' },
};

beforeEach(() => {
  vi.spyOn(window, 'confirm').mockReturnValue(true);
});

describe('AdminDuplicateAlbums', () => {
  test('shows an empty state when there are no candidate pairs', async () => {
    apiService.getDuplicateAlbums.mockResolvedValue({ data: { pairs: [], pagination: { page: 1, limit: 25, total: 0, totalPages: 1 } } });
    renderPage();

    await screen.findByText('No possible duplicate albums found.');
  });

  test('renders both albums in a pair with the tier label', async () => {
    apiService.getDuplicateAlbums.mockResolvedValue({ data: { pairs: [pair], pagination: { page: 1, limit: 25, total: 1, totalPages: 1 } } });
    renderPage();

    await screen.findByText('Greatest Hits');
    expect(screen.getByText('Greatest Hits (Remaster)')).toBeInTheDocument();
    expect(screen.getByText('Same release (MusicBrainz)')).toBeInTheDocument();
  });

  test('merging keeps the chosen album and removes the pair from the list', async () => {
    const user = userEvent.setup();
    apiService.getDuplicateAlbums.mockResolvedValue({ data: { pairs: [pair], pagination: { page: 1, limit: 25, total: 1, totalPages: 1 } } });
    apiService.resolveDuplicateAlbum.mockResolvedValue({ data: { success: true, tracks_moved: 3 } });
    renderPage();

    await screen.findByText('Greatest Hits');
    const leftCard = screen.getByText('Greatest Hits').closest('div');
    await user.click(within(leftCard).getByText('Keep this, merge the other in'));

    expect(apiService.resolveDuplicateAlbum).toHaveBeenCalledWith(10, 20);
    expect(screen.queryByText('Greatest Hits (Remaster)')).not.toBeInTheDocument();
  });

  test('dismissing a pair calls dismissDuplicate and removes it from the list', async () => {
    const user = userEvent.setup();
    apiService.getDuplicateAlbums.mockResolvedValue({ data: { pairs: [pair], pagination: { page: 1, limit: 25, total: 1, totalPages: 1 } } });
    apiService.dismissDuplicate.mockResolvedValue({ data: { success: true } });
    renderPage();

    await screen.findByText('Greatest Hits');
    await user.click(screen.getByText('Not a duplicate'));

    expect(apiService.dismissDuplicate).toHaveBeenCalledWith('album', 10, 20);
    expect(screen.queryByText('Greatest Hits')).not.toBeInTheDocument();
  });
});

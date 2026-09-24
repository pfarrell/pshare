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
    deleteAlbum: vi.fn(),
    compareAlbums: vi.fn(),
  },
}));

const renderPage = () => render(<MemoryRouter><AdminDuplicateAlbums /></MemoryRouter>);

const pair = {
  tier: 1,
  a: { id: 10, title: 'Greatest Hits', release_year: '1999', image_path: null, artist_name: 'Test Artist', track_count: 12 },
  b: { id: 20, title: 'Greatest Hits (Remaster)', release_year: '2005', image_path: null, artist_name: 'Test Artist', track_count: 10 },
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

  test('merging keeps the chosen album and removes the pair from the list, defaulting the offset to the kept album\'s track count', async () => {
    const user = userEvent.setup();
    apiService.getDuplicateAlbums.mockResolvedValue({ data: { pairs: [pair], pagination: { page: 1, limit: 25, total: 1, totalPages: 1 } } });
    apiService.resolveDuplicateAlbum.mockResolvedValue({ data: { success: true, tracks_moved: 3 } });
    renderPage();

    await screen.findByText('Greatest Hits');
    const leftCard = screen.getByText('Greatest Hits').closest('div');
    await user.click(within(leftCard).getByText('Keep this, merge the other in'));

    // pair.a.track_count is 12 — that's the default offset for keeping A.
    expect(apiService.resolveDuplicateAlbum).toHaveBeenCalledWith(10, 20, 12);
    expect(screen.queryByText('Greatest Hits (Remaster)')).not.toBeInTheDocument();
  });

  test('the track offset can be edited before merging', async () => {
    const user = userEvent.setup();
    apiService.getDuplicateAlbums.mockResolvedValue({ data: { pairs: [pair], pagination: { page: 1, limit: 25, total: 1, totalPages: 1 } } });
    apiService.resolveDuplicateAlbum.mockResolvedValue({ data: { success: true, tracks_moved: 3 } });
    renderPage();

    await screen.findByText('Greatest Hits');
    const leftCard = screen.getByText('Greatest Hits').closest('div');
    const offsetInput = within(leftCard).getByRole('spinbutton');
    await user.clear(offsetInput);
    await user.type(offsetInput, '0');
    await user.click(within(leftCard).getByText('Keep this, merge the other in'));

    expect(apiService.resolveDuplicateAlbum).toHaveBeenCalledWith(10, 20, 0);
    expect(window.confirm).toHaveBeenCalledWith(expect.stringContaining('Track numbers will not be changed.'));
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

  test('deleting an album calls deleteAlbum with a track-count warning and removes the pair', async () => {
    const user = userEvent.setup();
    apiService.getDuplicateAlbums.mockResolvedValue({ data: { pairs: [pair], pagination: { page: 1, limit: 25, total: 1, totalPages: 1 } } });
    apiService.deleteAlbum.mockResolvedValue({ data: { success: true } });
    renderPage();

    await screen.findByText('Greatest Hits');
    const leftCard = screen.getByText('Greatest Hits').closest('div');
    await user.click(within(leftCard).getByText('Delete'));

    expect(window.confirm).toHaveBeenCalledWith(expect.stringContaining('12 tracks'));
    expect(apiService.deleteAlbum).toHaveBeenCalledWith(10);
    expect(screen.queryByText('Greatest Hits')).not.toBeInTheDocument();
    expect(screen.queryByText('Greatest Hits (Remaster)')).not.toBeInTheDocument();
  });

  test('compare opens a modal that loads the comparison for both albums', async () => {
    const user = userEvent.setup();
    apiService.getDuplicateAlbums.mockResolvedValue({ data: { pairs: [pair], pagination: { page: 1, limit: 25, total: 1, totalPages: 1 } } });
    apiService.compareAlbums.mockResolvedValue({
      data: {
        a: { id: 10, title: 'Greatest Hits', artist_name: 'Test Artist', track_count: 1, tracks: [{ id: 1, track_number: '1', title: 'Song A', duration_sec: 180, media_file_id: 1 }] },
        b: { id: 20, title: 'Greatest Hits (Remaster)', artist_name: 'Test Artist', track_count: 1, tracks: [{ id: 2, track_number: '1', title: 'Song A (Remaster)', duration_sec: 182, media_file_id: 2 }] },
      },
    });
    renderPage();

    await screen.findByText('Greatest Hits');
    await user.click(screen.getAllByText('Compare')[0]);

    expect(apiService.compareAlbums).toHaveBeenCalledWith(10, 20);
    await screen.findByText('1. Song A (3:00)');
    expect(screen.getByText('1. Song A (Remaster) (3:02)')).toBeInTheDocument();
  });
});

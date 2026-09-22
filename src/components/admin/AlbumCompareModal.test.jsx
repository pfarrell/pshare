import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import AlbumCompareModal from './AlbumCompareModal';
import { apiService } from '../../services/api';

vi.mock('../../services/api', () => ({
  apiService: {
    compareAlbums: vi.fn(),
  },
}));

const comparePayload = {
  a: {
    id: 10, title: 'Greatest Hits', artist_id: 1, artist_name: 'Test Artist',
    release_year: '1999', disc_number: null, is_compilation: false,
    musicbrainz_id: 'abc-123', mbid_confidence: 0.9, mbid_status: 'matched',
    created_at: '2020-01-01T00:00:00Z', updated_at: '2020-06-01T00:00:00Z',
    track_count: 2,
    tracks: [
      { id: 1, track_number: '1', title: 'Song A', duration_sec: 180, media_file_id: 1 },
      { id: 2, track_number: '2', title: 'Song B', duration_sec: 200, media_file_id: 2 },
    ],
  },
  b: {
    id: 20, title: 'Greatest Hits (Remaster)', artist_id: 1, artist_name: 'Test Artist',
    release_year: '2005', disc_number: null, is_compilation: false,
    musicbrainz_id: null, mbid_confidence: null, mbid_status: 'unmatched',
    created_at: '2021-01-01T00:00:00Z', updated_at: '2021-06-01T00:00:00Z',
    track_count: 1,
    tracks: [
      { id: 3, track_number: '1', title: 'Song A (Remaster)', duration_sec: 182, media_file_id: 3 },
    ],
  },
};

const renderModal = (onClose = () => {}) =>
  render(<MemoryRouter><AlbumCompareModal idA={10} idB={20} onClose={onClose} /></MemoryRouter>);

describe('AlbumCompareModal', () => {
  test('fetches the comparison for both album ids', async () => {
    apiService.compareAlbums.mockResolvedValue({ data: comparePayload });
    renderModal();

    await screen.findByText('Song A (3:00)');
    expect(apiService.compareAlbums).toHaveBeenCalledWith(10, 20);
  });

  test('renders metadata rows for both albums, including a differing field', async () => {
    apiService.compareAlbums.mockResolvedValue({ data: comparePayload });
    renderModal();

    await screen.findByText('Song A (3:00)');
    expect(screen.getByText('1999')).toBeInTheDocument();
    expect(screen.getByText('2005')).toBeInTheDocument();
    expect(screen.getByText('abc-123')).toBeInTheDocument();
  });

  test('shows a track present on one side but not the other', async () => {
    apiService.compareAlbums.mockResolvedValue({ data: comparePayload });
    renderModal();

    await screen.findByText('Song A (3:00)');
    // Album B has no track 2 — that row should show a blank on B's side.
    expect(screen.getByText('Song B (3:20)')).toBeInTheDocument();
  });

  test('links each album title to its public page, opening in a new tab', async () => {
    apiService.compareAlbums.mockResolvedValue({ data: comparePayload });
    renderModal();

    const linkA = await screen.findByRole('link', { name: /Greatest Hits ↗/ });
    expect(linkA).toHaveAttribute('href', '/album/10');
    expect(linkA).toHaveAttribute('target', '_blank');

    const linkB = screen.getByRole('link', { name: /Greatest Hits \(Remaster\) ↗/ });
    expect(linkB).toHaveAttribute('href', '/album/20');
  });

  test('close button calls onClose', async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    apiService.compareAlbums.mockResolvedValue({ data: comparePayload });
    renderModal(onClose);

    await screen.findByText('Song A (3:00)');
    await user.click(screen.getByLabelText('Close'));
    expect(onClose).toHaveBeenCalled();
  });

  test('shows an error message if the comparison fails to load', async () => {
    apiService.compareAlbums.mockRejectedValue(new Error('boom'));
    renderModal();

    await screen.findByText('Failed to load comparison');
  });
});

import { render, screen, within } from '@testing-library/react';
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
      // Titles-roughly-match a parenthetical suffix against album A's "Song A" —
      // these two should pair despite the "(Remaster)" suffix.
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

    await screen.findByText('1. Song A (3:00)');
    expect(apiService.compareAlbums).toHaveBeenCalledWith(10, 20);
  });

  test('renders metadata rows for both albums, including a differing field', async () => {
    apiService.compareAlbums.mockResolvedValue({ data: comparePayload });
    renderModal();

    await screen.findByText('1. Song A (3:00)');
    expect(screen.getByText('1999')).toBeInTheDocument();
    expect(screen.getByText('2005')).toBeInTheDocument();
    expect(screen.getByText('abc-123')).toBeInTheDocument();
  });

  test('pairs tracks by title, not position — "Song A" and "Song A (Remaster)" land in the same row', async () => {
    apiService.compareAlbums.mockResolvedValue({ data: comparePayload });
    renderModal();

    const cellA = await screen.findByText('1. Song A (3:00)');
    const row = cellA.closest('tr');
    expect(within(row).getByText('1. Song A (Remaster) (3:02)')).toBeInTheDocument();
  });

  test('shows a track present on one side but not the other', async () => {
    apiService.compareAlbums.mockResolvedValue({ data: comparePayload });
    renderModal();

    await screen.findByText('1. Song A (3:00)');
    // Album B has nothing titled "Song B" — that row should show a blank on B's side.
    expect(screen.getByText('2. Song B (3:20)')).toBeInTheDocument();
  });

  test('links each album title to its public page, navigating in the same tab', async () => {
    // No target="_blank" here (deliberately — see comment on the Link): on
    // mobile, a real new tab/window either loses playback continuity
    // (standalone PWA hard-navigates in place) or just looks like it did
    // (a fresh backgrounded tab starts with an empty player). Plain in-SPA
    // navigation keeps MusicPlayerWrapper mounted and playback untouched.
    apiService.compareAlbums.mockResolvedValue({ data: comparePayload });
    renderModal();

    const linkA = await screen.findByRole('link', { name: 'Greatest Hits' });
    expect(linkA).toHaveAttribute('href', '/album/10');
    expect(linkA).not.toHaveAttribute('target');

    const linkB = screen.getByRole('link', { name: 'Greatest Hits (Remaster)' });
    expect(linkB).toHaveAttribute('href', '/album/20');
  });

  test('close button calls onClose', async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    apiService.compareAlbums.mockResolvedValue({ data: comparePayload });
    renderModal(onClose);

    await screen.findByText('1. Song A (3:00)');
    await user.click(screen.getByLabelText('Close'));
    expect(onClose).toHaveBeenCalled();
  });

  test('shows an error message if the comparison fails to load', async () => {
    apiService.compareAlbums.mockRejectedValue(new Error('boom'));
    renderModal();

    await screen.findByText('Failed to load comparison');
  });

  test('shows every track even when two tracks on the same side share a track_number', async () => {
    apiService.compareAlbums.mockResolvedValue({
      data: {
        a: {
          id: 10, title: 'Greatest Hits', artist_name: 'Test Artist', track_count: 2,
          tracks: [
            { id: 1, track_number: '1', title: 'Bonus Intro', duration_sec: 30, media_file_id: 1 },
            { id: 2, track_number: '1', title: 'Real Track One', duration_sec: 200, media_file_id: 2 },
          ],
        },
        b: {
          id: 20, title: 'Greatest Hits (Remaster)', artist_name: 'Test Artist', track_count: 1,
          tracks: [
            { id: 3, track_number: '1', title: 'Real Track One', duration_sec: 200, media_file_id: 3 },
          ],
        },
      },
    });
    renderModal();

    // Previously the second same-side "1" silently overwrote the first in a
    // Map keyed by track_number, so "Bonus Intro" never rendered at all.
    await screen.findByText('1. Bonus Intro (0:30)');
    expect(screen.getAllByText('1. Real Track One (3:20)')).toHaveLength(2);
  });

  test('pairs tracks by title even when track_number differs only by zero-padding', async () => {
    apiService.compareAlbums.mockResolvedValue({
      data: {
        a: {
          id: 10, title: 'Greatest Hits', artist_name: 'Test Artist', track_count: 1,
          tracks: [{ id: 1, track_number: '01', title: 'Song A', duration_sec: 180, media_file_id: 1 }],
        },
        b: {
          id: 20, title: 'Greatest Hits (Remaster)', artist_name: 'Test Artist', track_count: 1,
          tracks: [{ id: 2, track_number: '1', title: 'Song A', duration_sec: 180, media_file_id: 2 }],
        },
      },
    });
    renderModal();

    // Previously "1" and "01" were different Map keys, so this rendered as
    // two separate unpaired rows instead of one row with both sides filled in.
    const cellA = await screen.findByText('01. Song A (3:00)');
    const row = cellA.closest('tr');
    expect(within(row).getByText('1. Song A (3:00)')).toBeInTheDocument();
  });
});

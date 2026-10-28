import { render, screen, within, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import AdminLogs from './AdminLogs';
import { apiService } from '../services/api';

vi.mock('../services/api', () => ({
  apiService: {
    getLogs: vi.fn(),
  },
}));

const renderLogs = () =>
  render(
    <MemoryRouter>
      <AdminLogs />
    </MemoryRouter>
  );

const searchRow = {
  id: 1, action: 'search', query: 'radiohead',
  track_id: null, track_title: null,
  artist_id: null, artist_name: null,
  album_id: null, album_title: null,
  ip_address: '1.2.3.4', created_at: '2026-08-13T00:00:00Z',
};

const streamRow = {
  id: 2, action: 'stream', query: null,
  track_id: 5, track_title: 'Airbag',
  artist_id: 7, artist_name: 'Radiohead',
  album_id: 3, album_title: 'OK Computer',
  ip_address: '1.2.3.4', created_at: '2026-08-13T00:05:00Z',
};

describe('AdminLogs — search entries', () => {
  test('shows the query text for a search row', async () => {
    apiService.getLogs.mockResolvedValue({
      data: { logs: [searchRow], pagination: { page: 1, limit: 25, total: 1, totalPages: 1 } },
    });
    renderLogs();

    await screen.findByText('radiohead');
    expect(screen.getByText('search')).toBeInTheDocument();
  });

  test('shows a blank Query cell for a stream row', async () => {
    apiService.getLogs.mockResolvedValue({
      data: { logs: [streamRow], pagination: { page: 1, limit: 25, total: 1, totalPages: 1 } },
    });
    renderLogs();

    await screen.findByText('Airbag');
    const row = screen.getByText('Airbag').closest('tr');
    const cells = within(row).getAllByRole('cell');
    // Columns: ID, Date/Time, Action, Query, Track, Artist, Album, IP Address
    expect(cells[3]).toHaveTextContent('-');
  });

  test('search and stream badges use different colors', async () => {
    apiService.getLogs.mockResolvedValue({
      data: { logs: [searchRow, streamRow], pagination: { page: 1, limit: 25, total: 2, totalPages: 1 } },
    });
    renderLogs();

    await screen.findByText('search');
    const searchBadge = screen.getByText('search');
    const streamBadge = screen.getByText('stream');
    expect(searchBadge.style.backgroundColor).not.toBe(streamBadge.style.backgroundColor);
  });
});

const spotifyRow = {
  source: 'spotify', id: 2, action: 'spotify', query: null,
  track_id: null, track_title: 'Flower In A Hurricane',
  artist_id: null, artist_name: 'Justice',
  album_id: null, album_title: 'Flower In A Hurricane EP', album_spotify_id: 'r1',
  ip_address: '1.2.3.4', created_at: '2026-08-13T00:10:00Z',
};
const page = (logs) => ({ data: { logs, pagination: { page: 1, limit: 25, total: logs.length, totalPages: 1 } } });

describe('AdminLogs — Spotify plays (#72)', () => {
  beforeEach(() => apiService.getLogs.mockReset());

  test('a Spotify play shows a spotify badge, its names, and links the album to its Spotify page', async () => {
    apiService.getLogs.mockResolvedValue(page([spotifyRow, { ...streamRow, source: 'library' }]));
    renderLogs();

    await screen.findByText('Flower In A Hurricane');
    const badge = screen.getByText('spotify');
    expect(badge.style.backgroundColor).not.toBe(screen.getByText('stream').style.backgroundColor);
    const row = badge.closest('tr');
    expect(within(row).getByText('Justice').closest('a')).toBeNull();
    expect(within(row).getByRole('link', { name: 'Flower In A Hurricane EP' })).toHaveAttribute('href', '/spotify/album/r1');
  });

  test('a library row and a Spotify play with the same id both render', async () => {
    apiService.getLogs.mockResolvedValue(page([spotifyRow, { ...streamRow, source: 'library' }]));
    renderLogs();
    await screen.findByText('Airbag');
    expect(screen.getByText('Flower In A Hurricane')).toBeInTheDocument();
  });

  test('asks for all sources first, and the filter refetches page 1 for the chosen source', async () => {
    apiService.getLogs.mockResolvedValue(page([streamRow]));
    renderLogs();
    await screen.findByText('Airbag');
    expect(apiService.getLogs).toHaveBeenLastCalledWith(1, 25, 'all');

    apiService.getLogs.mockResolvedValue(page([spotifyRow]));
    fireEvent.click(screen.getByRole('button', { name: 'Spotify' }));
    await screen.findByText('Flower In A Hurricane');
    expect(apiService.getLogs).toHaveBeenLastCalledWith(1, 25, 'spotify');
    expect(screen.getByRole('button', { name: 'Spotify' })).toHaveAttribute('aria-pressed', 'true');

    fireEvent.click(screen.getByRole('button', { name: 'P·Share' }));
    await waitFor(() => expect(apiService.getLogs).toHaveBeenLastCalledWith(1, 25, 'library'));
  });
});

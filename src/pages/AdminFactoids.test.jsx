import { render, screen, within, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import AdminFactoids from './AdminFactoids';
import { apiService } from '../services/api';

vi.mock('../services/api', () => ({
  apiService: {
    adminListAllFactoids: vi.fn(),
    adminDeleteFactoid: vi.fn(),
  },
}));

const row = (over = {}) => ({
  id: 1, kind: 'album', target_id: 3, text: 'Recorded in a single night.',
  source_url: 'https://www.example.com/story', source_title: 'Example Story',
  model: 'claude-sonnet-5-5', created_at: '2026-10-05T12:00:00Z',
  subject: 'Axis: Bold As Love', by: 'Jimi Hendrix', link: { kind: 'album', id: 3 },
  ...over,
});

const page = (factoids, total = factoids.length) => ({
  data: { factoids, pagination: { page: 1, limit: 25, total, totalPages: Math.max(1, Math.ceil(total / 25)) } },
});

const renderPage = () => render(<MemoryRouter><AdminFactoids /></MemoryRouter>);

beforeEach(() => {
  vi.clearAllMocks();
  apiService.adminListAllFactoids.mockResolvedValue(page([row()]));
  apiService.adminDeleteFactoid.mockResolvedValue({ data: { success: true } });
});

describe('AdminFactoids', () => {
  test('shows each factoid with its subject, byline, source, and model', async () => {
    renderPage();

    const cell = await screen.findByText('Recorded in a single night.');
    const tr = cell.closest('tr');
    expect(within(tr).getByRole('link', { name: 'Axis: Bold As Love' })).toHaveAttribute('href', '/admin/album/3');
    expect(within(tr).getByText(/Jimi Hendrix/)).toBeInTheDocument();
    expect(within(tr).getByRole('link', { name: 'Example Story' })).toHaveAttribute('href', 'https://www.example.com/story');
    expect(within(tr).getByText('claude-sonnet-5-5')).toBeInTheDocument();
    expect(apiService.adminListAllFactoids).toHaveBeenCalledWith(1, 25, '', '');
  });

  test('an artist factoid links to the admin artist page', async () => {
    apiService.adminListAllFactoids.mockResolvedValue(page([
      row({ kind: 'artist', subject: 'Jimi Hendrix', by: null, link: { kind: 'artist', id: 9 } }),
    ]));
    renderPage();

    expect(await screen.findByRole('link', { name: 'Jimi Hendrix' })).toHaveAttribute('href', '/admin/artist/9');
  });

  test('a source that is not https is shown as text, never as a link', async () => {
    apiService.adminListAllFactoids.mockResolvedValue(page([
      row({ source_url: 'javascript:alert(1)', source_title: 'Sneaky' }),
    ]));
    renderPage();

    const tr = (await screen.findByText('Recorded in a single night.')).closest('tr');
    expect(within(tr).queryByRole('link', { name: 'Sneaky' })).not.toBeInTheDocument();
    expect(within(tr).getByText('Sneaky')).toBeInTheDocument();
  });

  test('a factoid whose subject was deleted still shows, flagged, with no link', async () => {
    apiService.adminListAllFactoids.mockResolvedValue(page([row({ subject: null, by: null, link: null })]));
    renderPage();

    const tr = (await screen.findByText('Recorded in a single night.')).closest('tr');
    expect(within(tr).getByText(/subject deleted/i)).toBeInTheDocument();
    expect(within(tr).queryByRole('link', { name: /subject deleted/i })).not.toBeInTheDocument();
    expect(within(tr).getByRole('button', { name: 'Delete' })).toBeInTheDocument();
  });

  test('choosing a kind reloads the list filtered by it, from page 1', async () => {
    renderPage();
    await screen.findByText('Recorded in a single night.');

    fireEvent.change(screen.getByLabelText(/kind/i), { target: { value: 'artist' } });

    await waitFor(() => expect(apiService.adminListAllFactoids).toHaveBeenLastCalledWith(1, 25, 'artist', ''));
  });

  test('searching reloads the list with the text', async () => {
    renderPage();
    await screen.findByText('Recorded in a single night.');

    fireEvent.change(screen.getByRole('searchbox'), { target: { value: 'single night' } });
    fireEvent.submit(screen.getByRole('search'));

    await waitFor(() => expect(apiService.adminListAllFactoids).toHaveBeenLastCalledWith(1, 25, '', 'single night'));
  });

  test('deleting a factoid removes it and reloads', async () => {
    apiService.adminListAllFactoids
      .mockResolvedValueOnce(page([row({ id: 1 }), row({ id: 2, text: 'Second fact.' })]))
      .mockResolvedValue(page([row({ id: 2, text: 'Second fact.' })]));
    renderPage();

    const tr = (await screen.findByText('Recorded in a single night.')).closest('tr');
    fireEvent.click(within(tr).getByRole('button', { name: 'Delete' }));

    await waitFor(() => expect(apiService.adminDeleteFactoid).toHaveBeenCalledWith(1));
    await waitFor(() => expect(screen.queryByText('Recorded in a single night.')).not.toBeInTheDocument());
    expect(screen.getByText('Second fact.')).toBeInTheDocument();
  });

  test('a failed delete keeps the row and says so', async () => {
    apiService.adminDeleteFactoid.mockRejectedValue(new Error('boom'));
    renderPage();

    const tr = (await screen.findByText('Recorded in a single night.')).closest('tr');
    fireEvent.click(within(tr).getByRole('button', { name: 'Delete' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(/could not delete/i);
    expect(screen.getByText('Recorded in a single night.')).toBeInTheDocument();
  });

  test('says so when nothing matches', async () => {
    apiService.adminListAllFactoids.mockResolvedValue(page([]));
    renderPage();

    expect(await screen.findByText(/no factoids found/i)).toBeInTheDocument();
  });

  test('offers a retry when the list cannot be loaded', async () => {
    apiService.adminListAllFactoids.mockRejectedValueOnce(new Error('down')).mockResolvedValue(page([row()]));
    renderPage();

    fireEvent.click(await screen.findByRole('button', { name: /retry/i }));

    expect(await screen.findByText('Recorded in a single night.')).toBeInTheDocument();
  });
});

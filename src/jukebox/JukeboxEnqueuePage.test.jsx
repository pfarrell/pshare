import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import JukeboxEnqueuePage from './JukeboxEnqueuePage';
import { apiService } from '../services/api';

vi.mock('../services/api', () => ({
  apiService: { jukeboxSearch: vi.fn(), submitToJukebox: vi.fn() },
}));

const renderPage = () => render(<MemoryRouter><JukeboxEnqueuePage token="abc123" /></MemoryRouter>);

beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
});

test('prompts for a name before allowing a search on first visit', () => {
  renderPage();
  expect(screen.getByPlaceholderText(/your name/i)).toBeInTheDocument();
  expect(screen.queryByPlaceholderText('Search')).not.toBeInTheDocument();
});

test('saving a name reveals the search box and does not prompt again on remount', async () => {
  renderPage();
  fireEvent.change(screen.getByPlaceholderText(/your name/i), { target: { value: 'Riley' } });
  fireEvent.click(screen.getByRole('button', { name: /continue/i }));

  await waitFor(() => expect(screen.getByPlaceholderText('Search')).toBeInTheDocument());

  renderPage();
  expect(screen.queryByPlaceholderText(/your name/i)).not.toBeInTheDocument();
});

test('searching shows results with an add-to-queue action', async () => {
  localStorage.setItem('jukebox-guest-name', 'Riley');
  apiService.jukeboxSearch.mockResolvedValue({
    data: { results: [], tracks: [{ id: 1, title: 'Found Track', artist: { name: 'Found Artist' } }] },
  });
  renderPage();

  fireEvent.change(screen.getByPlaceholderText('Search'), { target: { value: 'found' } });
  fireEvent.submit(screen.getByRole('search'));

  await waitFor(() => expect(screen.getByText('Found Track')).toBeInTheDocument());
  expect(screen.getByRole('button', { name: /add to queue/i })).toBeInTheDocument();
});

test('tapping add-to-queue submits with the stored name and shows a confirmation', async () => {
  localStorage.setItem('jukebox-guest-name', 'Riley');
  apiService.jukeboxSearch.mockResolvedValue({
    data: { results: [], tracks: [{ id: 1, title: 'Found Track', artist: { name: 'Found Artist' } }] },
  });
  apiService.submitToJukebox.mockResolvedValue({ data: [{ id: 1 }] });
  renderPage();
  fireEvent.change(screen.getByPlaceholderText('Search'), { target: { value: 'found' } });
  fireEvent.submit(screen.getByRole('search'));
  await waitFor(() => screen.getByText('Found Track'));

  fireEvent.click(screen.getByRole('button', { name: /add to queue/i }));

  await waitFor(() => expect(apiService.submitToJukebox).toHaveBeenCalledWith('abc123', [1], 'Riley'));
  await waitFor(() => expect(screen.getByText(/added/i)).toBeInTheDocument());
});

test('renders no player chrome — no play button, no now-playing', async () => {
  localStorage.setItem('jukebox-guest-name', 'Riley');
  renderPage();
  expect(screen.queryByRole('button', { name: /^play$/i })).not.toBeInTheDocument();
});

test('a failed add-to-queue shows an error message instead of failing silently', async () => {
  localStorage.setItem('jukebox-guest-name', 'Riley');
  apiService.jukeboxSearch.mockResolvedValue({
    data: { results: [], tracks: [{ id: 1, title: 'Found Track', artist: { name: 'Found Artist' } }] },
  });
  apiService.submitToJukebox.mockRejectedValueOnce(new Error('boom'));
  renderPage();
  fireEvent.change(screen.getByPlaceholderText('Search'), { target: { value: 'found' } });
  fireEvent.submit(screen.getByRole('search'));
  await waitFor(() => screen.getByText('Found Track'));

  fireEvent.click(screen.getByRole('button', { name: /add to queue/i }));

  await waitFor(() => expect(screen.getByText(/could not add that track/i)).toBeInTheDocument());
});

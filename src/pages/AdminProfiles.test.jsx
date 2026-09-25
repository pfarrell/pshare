import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import AdminProfiles from './AdminProfiles';
import { apiService } from '../services/api';

vi.mock('../services/api', () => ({
  apiService: { getProfiles: vi.fn(), deleteProfile: vi.fn() },
}));

const renderPage = () => render(<MemoryRouter><AdminProfiles /></MemoryRouter>);

beforeEach(() => {
  vi.clearAllMocks();
  apiService.getProfiles.mockResolvedValue({
    data: [
      { id: 1, name: 'Kids', tags: [{ id: 1, name: 'kids' }, { id: 2, name: 'disney' }] },
      { id: 2, name: 'Focus', tags: [{ id: 3, name: 'instrumental' }] },
    ],
  });
});

test('lists profiles with their tag names', async () => {
  renderPage();
  await waitFor(() => expect(screen.getByText('Kids')).toBeInTheDocument());
  expect(screen.getByText(/kids, disney/)).toBeInTheDocument();
  expect(screen.getByText('Focus')).toBeInTheDocument();
  expect(screen.getByText(/instrumental/)).toBeInTheDocument();
});

test('has a link to create a new profile', async () => {
  renderPage();
  await waitFor(() => screen.getByText('Kids'));
  expect(screen.getByRole('link', { name: /new profile/i })).toHaveAttribute('href', '/admin/profiles/new');
});

test('deleting a profile confirms, calls the API, and removes it from the list', async () => {
  window.confirm = vi.fn(() => true);
  apiService.deleteProfile.mockResolvedValue({});
  renderPage();
  await waitFor(() => screen.getByText('Kids'));

  fireEvent.click(screen.getAllByRole('button', { name: /delete/i })[0]);

  await waitFor(() => expect(apiService.deleteProfile).toHaveBeenCalledWith(1));
  await waitFor(() => expect(screen.queryByText('Kids')).not.toBeInTheDocument());
});

test('declining the confirm does not delete', async () => {
  window.confirm = vi.fn(() => false);
  renderPage();
  await waitFor(() => screen.getByText('Kids'));

  fireEvent.click(screen.getAllByRole('button', { name: /delete/i })[0]);

  expect(apiService.deleteProfile).not.toHaveBeenCalled();
});

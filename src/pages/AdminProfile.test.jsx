import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import AdminProfile from './AdminProfile';
import { apiService } from '../services/api';

vi.mock('../services/api', () => ({
  apiService: {
    getProfiles: vi.fn(),
    getTags: vi.fn(),
    createProfile: vi.fn(),
    updateProfile: vi.fn(),
  },
}));

const renderAt = (path) =>
  render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/admin/profiles/new" element={<AdminProfile />} />
        <Route path="/admin/profiles/:id" element={<AdminProfile />} />
      </Routes>
    </MemoryRouter>
  );

beforeEach(() => {
  vi.clearAllMocks();
  apiService.getTags.mockResolvedValue({ data: [{ id: 1, name: 'kids' }, { id: 2, name: 'disney' }] });
  apiService.getProfiles.mockResolvedValue({
    data: [{ id: 7, name: 'Kids', tags: [{ id: 1, name: 'kids' }] }],
  });
});

test('create mode: starts with an empty name and no tags', async () => {
  renderAt('/admin/profiles/new');
  await waitFor(() => screen.getByPlaceholderText('Profile name'));
  expect(screen.getByPlaceholderText('Profile name')).toHaveValue('');
  expect(screen.getByRole('button', { name: /save/i })).toBeDisabled();
});

test('create mode: typing a name and adding a tag enables Save, and Save calls createProfile', async () => {
  apiService.createProfile.mockResolvedValue({ data: { id: 9, name: 'New Profile' } });
  renderAt('/admin/profiles/new');
  await waitFor(() => screen.getByPlaceholderText('Profile name'));

  fireEvent.change(screen.getByPlaceholderText('Profile name'), { target: { value: 'New Profile' } });
  fireEvent.change(screen.getByPlaceholderText('add tag…'), { target: { value: 'kids' } });
  await waitFor(() => screen.getByText('#kids'));
  fireEvent.mouseDown(screen.getByText('#kids'));

  expect(screen.getByRole('button', { name: /save/i })).toBeEnabled();
  fireEvent.click(screen.getByRole('button', { name: /save/i }));

  await waitFor(() => expect(apiService.createProfile).toHaveBeenCalledWith('New Profile', [1]));
});

test('edit mode: loads the existing profile\'s name and tags', async () => {
  renderAt('/admin/profiles/7');
  await waitFor(() => expect(screen.getByPlaceholderText('Profile name')).toHaveValue('Kids'));
  expect(screen.getByText('#kids')).toBeInTheDocument();
});

test('edit mode: removing the only tag and saving is blocked (Save disabled)', async () => {
  renderAt('/admin/profiles/7');
  await waitFor(() => screen.getByText('#kids'));

  fireEvent.click(screen.getByRole('button', { name: /remove kids/i }));

  expect(screen.getByRole('button', { name: /save/i })).toBeDisabled();
});

test('edit mode: Save calls updateProfile with the current id, name, and tag ids', async () => {
  apiService.updateProfile.mockResolvedValue({ data: { id: 7, name: 'Kids' } });
  renderAt('/admin/profiles/7');
  await waitFor(() => screen.getByText('#kids'));

  fireEvent.click(screen.getByRole('button', { name: /save/i }));

  await waitFor(() => expect(apiService.updateProfile).toHaveBeenCalledWith(7, 'Kids', [1]));
});

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
        <Route path="/admin/profiles" element={<div>Profiles list page</div>} />
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

test('rapid typing before the tag list finishes loading does not trigger duplicate getTags calls', async () => {
  let resolveTags;
  apiService.getTags.mockReturnValue(new Promise((resolve) => { resolveTags = resolve; }));
  renderAt('/admin/profiles/new');
  await waitFor(() => screen.getByPlaceholderText('add tag…'));

  const input = screen.getByPlaceholderText('add tag…');
  fireEvent.focus(input);
  fireEvent.change(input, { target: { value: 'k' } });
  fireEvent.change(input, { target: { value: 'ki' } });
  fireEvent.change(input, { target: { value: 'kid' } });

  resolveTags({ data: [{ id: 1, name: 'kids' }, { id: 2, name: 'disney' }] });
  await waitFor(() => screen.getByText('#kids'));

  expect(apiService.getTags).toHaveBeenCalledTimes(1);
});

test('edit mode: navigating to a profile id that no longer exists redirects to the list', async () => {
  apiService.getProfiles.mockResolvedValue({
    data: [{ id: 7, name: 'Kids', tags: [{ id: 1, name: 'kids' }] }],
  });
  renderAt('/admin/profiles/999');

  await waitFor(() => expect(screen.getByText('Profiles list page')).toBeInTheDocument());
});

test('edit mode: shows an error with retry when loading the profile fails', async () => {
  apiService.getProfiles.mockRejectedValueOnce(new Error('Network error'));
  renderAt('/admin/profiles/7');

  await waitFor(() => expect(screen.getByText('Network error')).toBeInTheDocument());
  expect(screen.getByRole('button', { name: /retry/i })).toBeInTheDocument();

  apiService.getProfiles.mockResolvedValueOnce({
    data: [{ id: 7, name: 'Kids', tags: [{ id: 1, name: 'kids' }] }],
  });
  fireEvent.click(screen.getByRole('button', { name: /retry/i }));

  await waitFor(() => expect(screen.getByPlaceholderText('Profile name')).toHaveValue('Kids'));
});

test('create mode: a failed save shows an inline error message', async () => {
  apiService.createProfile.mockRejectedValue(new Error('Name already taken'));
  renderAt('/admin/profiles/new');
  await waitFor(() => screen.getByPlaceholderText('Profile name'));

  fireEvent.change(screen.getByPlaceholderText('Profile name'), { target: { value: 'New Profile' } });
  fireEvent.change(screen.getByPlaceholderText('add tag…'), { target: { value: 'kids' } });
  await waitFor(() => screen.getByText('#kids'));
  fireEvent.mouseDown(screen.getByText('#kids'));
  fireEvent.click(screen.getByRole('button', { name: /save/i }));

  await waitFor(() => expect(screen.getByText('Name already taken')).toBeInTheDocument());
});

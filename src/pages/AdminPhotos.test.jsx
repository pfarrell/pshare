// src/pages/AdminPhotos.test.jsx
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { vi } from 'vitest';
import AdminPhotos from './AdminPhotos';

vi.mock('react-hot-toast', () => ({ default: { success: vi.fn(), error: vi.fn() } }));
vi.mock('../services/api', () => ({
  apiService: {
    getAdminPhotos: vi.fn(),
    uploadPhoto: vi.fn(),
    deletePhoto: vi.fn(),
    getImageUrl: vi.fn((path, context) => `img:${context}:${path}`),
  },
}));

import { apiService } from '../services/api';
import toast from 'react-hot-toast';

const renderPage = () => render(<MemoryRouter><AdminPhotos /></MemoryRouter>);
const photo = (overrides = {}) => ({ id: 1, image_path: 'a.jpg', width: 800, height: 600, ...overrides });

beforeEach(() => {
  vi.clearAllMocks();
  window.confirm = vi.fn(() => true);
});

test('shows an empty state when there are no photos', async () => {
  apiService.getAdminPhotos.mockResolvedValue({ data: [] });
  renderPage();

  await waitFor(() => expect(screen.getByText('No photos yet.')).toBeInTheDocument());
});

test('renders a grid tile per photo using the photo_small image context', async () => {
  apiService.getAdminPhotos.mockResolvedValue({ data: [photo()] });
  renderPage();

  await waitFor(() => expect(screen.getByRole('img')).toHaveAttribute('src', 'img:photo_small:a.jpg'));
});

test('selecting a file uploads it and reloads the list', async () => {
  const user = userEvent.setup();
  apiService.getAdminPhotos.mockResolvedValueOnce({ data: [] }).mockResolvedValueOnce({ data: [photo()] });
  apiService.uploadPhoto.mockResolvedValue({ data: { id: 1, image_path: 'a.jpg' } });
  renderPage();
  await waitFor(() => expect(screen.getByText('No photos yet.')).toBeInTheDocument());

  const file = new File(['x'], 'a.jpg', { type: 'image/jpeg' });
  await user.upload(screen.getByLabelText(/upload photo/i), file);

  await waitFor(() => expect(apiService.uploadPhoto).toHaveBeenCalledWith(file));
  await waitFor(() => expect(screen.getByRole('img')).toBeInTheDocument());
  expect(toast.success).toHaveBeenCalledWith('Photo added');
});

test('a failed upload shows an error toast and does not add a tile', async () => {
  // The file itself is image-typed (the input's accept="image/*" would
  // otherwise make @testing-library/user-event silently skip a
  // non-image file before it ever reaches our onChange — see
  // upload.js's isAcceptableFile filtering). This test is about the
  // client displaying a *server-side* rejection (corrupt bytes, unsupported
  // subtype, etc.), which is what apiService.uploadPhoto's mocked rejection
  // simulates — not the browser's own file-picker filtering.
  const user = userEvent.setup();
  apiService.getAdminPhotos.mockResolvedValue({ data: [] });
  apiService.uploadPhoto.mockRejectedValue({ response: { data: { error: 'Unsupported image type' } } });
  renderPage();
  await waitFor(() => expect(screen.getByText('No photos yet.')).toBeInTheDocument());

  const file = new File(['x'], 'a.png', { type: 'image/png' });
  await user.upload(screen.getByLabelText(/upload photo/i), file);

  await waitFor(() => expect(toast.error).toHaveBeenCalledWith('Unsupported image type'));
  expect(screen.getByText('No photos yet.')).toBeInTheDocument();
});

test('deleting a photo confirms, then removes it and calls apiService.deletePhoto', async () => {
  const user = userEvent.setup();
  apiService.getAdminPhotos.mockResolvedValue({ data: [photo()] });
  apiService.deletePhoto.mockResolvedValue({ data: { success: true } });
  renderPage();
  await waitFor(() => expect(screen.getByRole('img')).toBeInTheDocument());

  await user.click(screen.getByRole('button', { name: /delete/i }));

  expect(window.confirm).toHaveBeenCalled();
  expect(apiService.deletePhoto).toHaveBeenCalledWith(1);
  await waitFor(() => expect(screen.queryByRole('img')).not.toBeInTheDocument());
});

test('declining the confirm dialog leaves the photo in place', async () => {
  const user = userEvent.setup();
  window.confirm = vi.fn(() => false);
  apiService.getAdminPhotos.mockResolvedValue({ data: [photo()] });
  renderPage();
  await waitFor(() => expect(screen.getByRole('img')).toBeInTheDocument());

  await user.click(screen.getByRole('button', { name: /delete/i }));

  expect(apiService.deletePhoto).not.toHaveBeenCalled();
  expect(screen.getByRole('img')).toBeInTheDocument();
});

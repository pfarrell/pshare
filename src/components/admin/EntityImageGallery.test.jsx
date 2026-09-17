import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import toast from 'react-hot-toast';
import EntityImageGallery from './EntityImageGallery';
import { apiService } from '../../services/api';

vi.mock('react-hot-toast', () => ({ default: { success: vi.fn(), error: vi.fn() } }));
vi.mock('../../services/api', () => {
  const kindApi = () => ({ list: vi.fn(), add: vi.fn(), setPrimary: vi.fn(), remove: vi.fn() });
  return { apiService: { entityImages: { album: kindApi(), artist: kindApi() }, getImageUrl: (p) => `/images/${p}` } };
});

const albumApi = () => apiService.entityImages.album;

beforeEach(() => {
  vi.clearAllMocks();
  albumApi().list.mockResolvedValue({ data: [] });
});

describe('EntityImageGallery', () => {
  test('first image added becomes primary and reports its path', async () => {
    const onPrimaryChange = vi.fn();
    albumApi().add.mockResolvedValue({ data: {} });
    render(<EntityImageGallery kind="album" entityId="10" defaultFilename="a-b.jpg" onPrimaryChange={onPrimaryChange} />);
    await userEvent.type(screen.getByPlaceholderText('https://...'), 'https://x/y.jpg');
    await userEvent.click(screen.getByRole('button', { name: 'Add Image' }));
    await waitFor(() => expect(albumApi().add).toHaveBeenCalledWith('10', 'https://x/y.jpg', 'a-b.jpg', true));
    expect(onPrimaryChange).toHaveBeenCalledWith('a-b.jpg');
    expect(toast.success).toHaveBeenCalledWith('Image added');
  });

  test('regression: a failed album image add shows an error toast', async () => {
    albumApi().add.mockRejectedValue({ response: { data: { error: 'Failed to download image: 404' } } });
    render(<EntityImageGallery kind="album" entityId="10" defaultFilename="a-b.jpg" onPrimaryChange={vi.fn()} />);
    await userEvent.type(screen.getByPlaceholderText('https://...'), 'https://x/missing.jpg');
    await userEvent.click(screen.getByRole('button', { name: 'Add Image' }));
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith('Failed to download image: 404'));
    expect(screen.getByRole('button', { name: 'Add Image' })).not.toBeDisabled();
  });

  test('Set Primary calls the API, reloads, and reports the path', async () => {
    const onPrimaryChange = vi.fn();
    albumApi().list.mockResolvedValue({ data: [
      { id: 1, path: 'one.jpg', is_primary: true, source: 'manual', status: 'active' },
      { id: 2, path: 'two.jpg', is_primary: false, source: 'caa', status: 'active' },
    ] });
    albumApi().setPrimary.mockResolvedValue({});
    render(<EntityImageGallery kind="album" entityId="10" defaultFilename="x.jpg" onPrimaryChange={onPrimaryChange} />);
    await userEvent.click(await screen.findByRole('button', { name: 'Set Primary' }));
    await waitFor(() => expect(albumApi().setPrimary).toHaveBeenCalledWith('10', 2));
    expect(onPrimaryChange).toHaveBeenCalledWith('two.jpg');
  });
});

import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import JukeboxQrCode from './JukeboxQrCode';
import { apiService } from '../services/api';

vi.mock('../services/api', () => ({
  apiService: { rotateJukeboxToken: vi.fn() },
}));

vi.mock('qrcode', () => ({
  default: { toDataURL: vi.fn(() => Promise.resolve('data:image/png;base64,fake')) },
}));

beforeEach(() => {
  vi.clearAllMocks();
});

test('renders a QR code image for the given url', async () => {
  render(<JukeboxQrCode url="https://patf.com/pshare/jukebox/abc123" deviceId={5} onRotated={vi.fn()} />);
  await waitFor(() => expect(screen.getByRole('img', { name: /qr code/i })).toBeInTheDocument());
});

test('clicking "Get new QR code" rotates the token and reports the new one', async () => {
  apiService.rotateJukeboxToken.mockResolvedValue({ data: { enqueue_token: 'new-token-xyz' } });
  const onRotated = vi.fn();
  render(<JukeboxQrCode url="https://patf.com/pshare/jukebox/abc123" deviceId={5} onRotated={onRotated} />);
  await waitFor(() => screen.getByRole('img', { name: /qr code/i }));

  fireEvent.click(screen.getByRole('button', { name: /get new qr code/i }));

  await waitFor(() => expect(apiService.rotateJukeboxToken).toHaveBeenCalledWith(5));
  await waitFor(() => expect(onRotated).toHaveBeenCalledWith('new-token-xyz'));
});

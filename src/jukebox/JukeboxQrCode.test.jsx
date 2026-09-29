import { render, screen, waitFor } from '@testing-library/react';
import JukeboxQrCode from './JukeboxQrCode';

vi.mock('qrcode', () => ({
  default: { toDataURL: vi.fn(() => Promise.resolve('data:image/png;base64,fake')) },
}));

test('renders a QR code image for the given url', async () => {
  render(<JukeboxQrCode url="https://patf.com/pshare/jukebox/abc123" />);
  await waitFor(() => expect(screen.getByRole('img', { name: /qr code/i })).toBeInTheDocument());
});

test('offers no way to regenerate the code', async () => {
  render(<JukeboxQrCode url="https://patf.com/pshare/jukebox/abc123" />);
  await waitFor(() => screen.getByRole('img', { name: /qr code/i }));
  expect(screen.queryByRole('button')).not.toBeInTheDocument();
});

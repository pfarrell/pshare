import { screen, fireEvent, waitFor } from '@testing-library/react';
import GuestRemote from './GuestRemote';
import { renderGuest } from './testUtils';
import { apiService } from '../../services/api';
import { redirectToLogin } from './guestLogin';

vi.mock('../../services/api', () => ({
  apiService: { sendJukeboxCommand: vi.fn(), submitToJukebox: vi.fn() },
}));
vi.mock('./guestLogin', async (importOriginal) => ({
  ...(await importOriginal()),
  redirectToLogin: vi.fn(),
}));

const renderRemote = (route = '/jukebox/tok') =>
  renderGuest(<GuestRemote />, { path: '/jukebox/:token/*', route });

beforeEach(() => {
  vi.clearAllMocks();
  apiService.sendJukeboxCommand.mockResolvedValue({ data: { ok: true } });
});

test('always renders previous, play/pause and next, with no scrubber', () => {
  renderRemote();
  expect(screen.getByRole('button', { name: 'Jukebox previous' })).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Jukebox play or pause' })).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Jukebox next' })).toBeInTheDocument();
  expect(screen.getAllByRole('button')).toHaveLength(3);
  expect(screen.queryByRole('slider')).not.toBeInTheDocument();
});

test.each([
  ['Jukebox previous', 'prev'],
  ['Jukebox play or pause', 'toggle'],
  ['Jukebox next', 'next'],
])('%s sends the %s command with the url token', async (label, command) => {
  renderRemote();
  fireEvent.click(screen.getByRole('button', { name: label }));
  await waitFor(() => expect(apiService.sendJukeboxCommand).toHaveBeenCalledWith('tok', command));
  expect(redirectToLogin).not.toHaveBeenCalled();
});

test('a 401 (not logged in) asks first, then sends the visitor to login on confirm, returning to the page they were on', async () => {
  apiService.sendJukeboxCommand.mockRejectedValue({ response: { status: 401 } });
  renderRemote('/jukebox/tok/search?q=abba');
  fireEvent.click(screen.getByRole('button', { name: 'Jukebox next' }));
  expect(await screen.findByRole('dialog')).toBeInTheDocument();
  expect(redirectToLogin).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button', { name: 'Log in' }));
  await waitFor(() => expect(redirectToLogin).toHaveBeenCalledWith('/jukebox/tok/search?q=abba'));
});

test('cancelling the login prompt stays on the page without redirecting', async () => {
  apiService.sendJukeboxCommand.mockRejectedValue({ response: { status: 401 } });
  renderRemote();
  fireEvent.click(screen.getByRole('button', { name: 'Jukebox next' }));
  await screen.findByRole('dialog');
  fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
  await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  expect(redirectToLogin).not.toHaveBeenCalled();
});

test.each([
  [409, /not connected/i],
  [404, /link has expired/i],
  [429, /slow down/i],
  [500, /could not reach/i],
])('a %s response shows a clear message and does not redirect', async (status, message) => {
  apiService.sendJukeboxCommand.mockRejectedValue({ response: { status } });
  renderRemote();
  fireEvent.click(screen.getByRole('button', { name: 'Jukebox next' }));
  expect(await screen.findByText(message)).toBeInTheDocument();
  expect(redirectToLogin).not.toHaveBeenCalled();
});

test('a network failure with no response shows the could-not-reach message', async () => {
  apiService.sendJukeboxCommand.mockRejectedValue(new Error('offline'));
  renderRemote();
  fireEvent.click(screen.getByRole('button', { name: 'Jukebox next' }));
  expect(await screen.findByText(/could not reach/i)).toBeInTheDocument();
});

test('buttons lock while a command is in flight so a double tap cannot cancel a toggle', async () => {
  let resolve;
  apiService.sendJukeboxCommand.mockImplementation(() => new Promise((r) => { resolve = r; }));
  renderRemote();

  fireEvent.click(screen.getByRole('button', { name: 'Jukebox play or pause' }));
  expect(screen.getByRole('button', { name: 'Jukebox play or pause' })).toBeDisabled();
  fireEvent.click(screen.getByRole('button', { name: 'Jukebox play or pause' }));
  expect(apiService.sendJukeboxCommand).toHaveBeenCalledTimes(1);

  resolve({ data: { ok: true } });
  await waitFor(() => expect(screen.getByRole('button', { name: 'Jukebox play or pause' })).not.toBeDisabled());
});

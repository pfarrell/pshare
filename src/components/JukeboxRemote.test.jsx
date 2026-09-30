import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import JukeboxRemote from './JukeboxRemote';
import { apiService } from '../services/api';

vi.mock('../services/api', () => ({
  apiService: { sendJukeboxCommand: vi.fn() },
}));

const withToken = (token = 'tok') => localStorage.setItem('jukebox-enqueue-token', token);

beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
  apiService.sendJukeboxCommand.mockResolvedValue({ data: { ok: true } });
});

test('renders nothing when no jukebox has been connected', () => {
  const { container } = render(<JukeboxRemote />);
  expect(container).toBeEmptyDOMElement();
});

test('shows previous, play/pause and next when a jukebox token is stored', () => {
  withToken();
  render(<JukeboxRemote />);
  expect(screen.getByText('Jukebox remote')).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Jukebox previous' })).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Jukebox play or pause' })).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Jukebox next' })).toBeInTheDocument();
});

test('has no scrubbing or seek control', () => {
  withToken();
  render(<JukeboxRemote />);
  expect(screen.queryByRole('slider')).not.toBeInTheDocument();
  expect(screen.getAllByRole('button')).toHaveLength(3);
});

test.each([
  ['Jukebox previous', 'prev'],
  ['Jukebox play or pause', 'toggle'],
  ['Jukebox next', 'next'],
])('%s sends the %s command with the stored token', async (label, command) => {
  withToken('abc123');
  render(<JukeboxRemote />);
  fireEvent.click(screen.getByRole('button', { name: label }));
  await waitFor(() => expect(apiService.sendJukeboxCommand).toHaveBeenCalledWith('abc123', command));
});

test.each([
  [409, /not connected/i],
  [404, /link has expired/i],
  [401, /log in again/i],
  [429, /slow down/i],
  [500, /could not reach/i],
])('a %s response shows a clear message', async (status, message) => {
  withToken();
  apiService.sendJukeboxCommand.mockRejectedValue({ response: { status } });
  render(<JukeboxRemote />);
  fireEvent.click(screen.getByRole('button', { name: 'Jukebox next' }));
  expect(await screen.findByText(message)).toBeInTheDocument();
});

test('a network failure with no response shows the could-not-reach message', async () => {
  withToken();
  apiService.sendJukeboxCommand.mockRejectedValue(new Error('offline'));
  render(<JukeboxRemote />);
  fireEvent.click(screen.getByRole('button', { name: 'Jukebox next' }));
  expect(await screen.findByText(/could not reach/i)).toBeInTheDocument();
});

test('a later success clears an earlier error', async () => {
  withToken();
  apiService.sendJukeboxCommand.mockRejectedValueOnce({ response: { status: 409 } });
  render(<JukeboxRemote />);
  fireEvent.click(screen.getByRole('button', { name: 'Jukebox next' }));
  await screen.findByText(/not connected/i);

  fireEvent.click(screen.getByRole('button', { name: 'Jukebox next' }));
  await waitFor(() => expect(screen.queryByText(/not connected/i)).not.toBeInTheDocument());
});

test('buttons are disabled while a command is in flight so a double tap cannot cancel a toggle', async () => {
  withToken();
  let resolve;
  apiService.sendJukeboxCommand.mockImplementation(() => new Promise((r) => { resolve = r; }));
  render(<JukeboxRemote />);

  fireEvent.click(screen.getByRole('button', { name: 'Jukebox play or pause' }));
  expect(screen.getByRole('button', { name: 'Jukebox play or pause' })).toBeDisabled();
  fireEvent.click(screen.getByRole('button', { name: 'Jukebox play or pause' }));
  expect(apiService.sendJukeboxCommand).toHaveBeenCalledTimes(1);

  resolve({ data: { ok: true } });
  await waitFor(() => expect(screen.getByRole('button', { name: 'Jukebox play or pause' })).not.toBeDisabled());
});

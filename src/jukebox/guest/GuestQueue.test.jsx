import { screen, fireEvent, waitFor } from '@testing-library/react';
import GuestQueue from './GuestQueue';
import { renderGuest } from './testUtils';
import { apiService } from '../../services/api';
import { redirectToLogin } from './guestLogin';

vi.mock('../../services/api', () => ({
  apiService: { getJukeboxQueue: vi.fn(), sendJukeboxCommand: vi.fn(), submitToJukebox: vi.fn() },
}));
vi.mock('./guestLogin', async (importOriginal) => ({
  ...(await importOriginal()),
  redirectToLogin: vi.fn(),
}));

const renderQueue = () =>
  renderGuest(<GuestQueue />, { path: '/jukebox/:token/queue', route: '/jukebox/tok/queue' });

const live = (over = {}) => ({
  connected: true,
  currentIndex: 4,
  isPlaying: true,
  queue: [
    { index: 4, id: 10, title: 'Current Song', artist: 'Band' },
    { index: 5, id: 11, title: 'Next Song', artist: 'Other' },
    { index: 6, id: 12, title: 'Later Song', artist: null },
  ],
  ...over,
});

beforeEach(() => {
  vi.clearAllMocks();
  apiService.getJukeboxQueue.mockResolvedValue({ data: live() });
  apiService.sendJukeboxCommand.mockResolvedValue({ data: { ok: true } });
});

test('shows the current track under Now playing and the rest under Up next', async () => {
  renderQueue();
  expect(await screen.findByText('Now playing')).toBeInTheDocument();
  expect(screen.getByText('Up next')).toBeInTheDocument();
  expect(screen.getByText('Current Song')).toBeInTheDocument();
  expect(screen.getByText('Next Song')).toBeInTheDocument();
  expect(screen.getByText('Later Song')).toBeInTheDocument();
});

test('labels the current section "Current track" when paused', async () => {
  apiService.getJukeboxQueue.mockResolvedValue({ data: live({ isPlaying: false }) });
  renderQueue();
  expect(await screen.findByText('Current track')).toBeInTheDocument();
});

test('tapping a track jumps to it by row index and track id, then refreshes', async () => {
  renderQueue();
  fireEvent.click(await screen.findByRole('button', { name: 'Later Song' }));
  await waitFor(() => expect(apiService.sendJukeboxCommand).toHaveBeenCalledWith('tok', 'jump', { index: 6, trackId: 12 }));
  await waitFor(() => expect(apiService.getJukeboxQueue.mock.calls.length).toBeGreaterThan(1));
});

test('each upcoming track has a remove button that sends remove with index and track id', async () => {
  renderQueue();
  fireEvent.click(await screen.findByRole('button', { name: 'Remove Next Song from queue' }));
  await waitFor(() => expect(apiService.sendJukeboxCommand).toHaveBeenCalledWith('tok', 'remove', { index: 5, trackId: 11 }));
});

test('the current track has no remove button', async () => {
  renderQueue();
  await screen.findByText('Current Song');
  expect(screen.queryByRole('button', { name: /Remove Current Song/ })).not.toBeInTheDocument();
  expect(screen.getAllByRole('button', { name: /Remove .* from queue/ })).toHaveLength(2);
});

test('a 401 on jump or remove sends a logged-out visitor to login and back to the queue', async () => {
  apiService.sendJukeboxCommand.mockRejectedValue({ response: { status: 401 } });
  renderQueue();
  fireEvent.click(await screen.findByRole('button', { name: 'Remove Next Song from queue' }));
  await screen.findByRole('dialog');
  expect(redirectToLogin).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button', { name: 'Log in' }));
  await waitFor(() => expect(redirectToLogin).toHaveBeenCalledWith('/jukebox/tok/queue'));
});

test('other command errors show a message and do not redirect', async () => {
  apiService.sendJukeboxCommand.mockRejectedValue({ response: { status: 409 } });
  renderQueue();
  fireEvent.click(await screen.findByRole('button', { name: 'Later Song' }));
  expect(await screen.findByText(/not connected/i)).toBeInTheDocument();
  expect(redirectToLogin).not.toHaveBeenCalled();
});

test('a row locks while its command is in flight so a double tap cannot fire twice', async () => {
  let resolve;
  apiService.sendJukeboxCommand.mockImplementation(() => new Promise((r) => { resolve = r; }));
  renderQueue();
  const remove = await screen.findByRole('button', { name: 'Remove Next Song from queue' });

  fireEvent.click(remove);
  expect(screen.getByRole('button', { name: 'Remove Next Song from queue' })).toBeDisabled();
  fireEvent.click(screen.getByRole('button', { name: 'Remove Next Song from queue' }));
  fireEvent.click(screen.getByRole('button', { name: 'Later Song' }));
  expect(apiService.sendJukeboxCommand).toHaveBeenCalledTimes(1);

  resolve({ data: { ok: true } });
  await waitFor(() => expect(screen.getByRole('button', { name: 'Remove Next Song from queue' })).not.toBeDisabled());
});

test('shows a not-connected message and no list when the jukebox is offline', async () => {
  apiService.getJukeboxQueue.mockResolvedValue({ data: { connected: false, queue: [], currentIndex: -1, isPlaying: false } });
  renderQueue();
  expect(await screen.findByText(/jukebox is not connected/i)).toBeInTheDocument();
  expect(screen.queryByText('Up next')).not.toBeInTheDocument();
});

test('shows an empty state pointing at Search and Home when nothing is queued', async () => {
  apiService.getJukeboxQueue.mockResolvedValue({ data: { connected: true, queue: [], currentIndex: -1, isPlaying: false } });
  renderQueue();
  expect(await screen.findByText(/nothing queued/i)).toBeInTheDocument();
});

test('with nothing playing yet, every track is listed under Up next', async () => {
  apiService.getJukeboxQueue.mockResolvedValue({ data: live({ currentIndex: -1, isPlaying: false }) });
  renderQueue();
  expect(await screen.findByText('Up next')).toBeInTheDocument();
  expect(screen.queryByText('Now playing')).not.toBeInTheDocument();
  expect(screen.queryByText('Current track')).not.toBeInTheDocument();
  expect(screen.getAllByRole('button', { name: /Remove .* from queue/ })).toHaveLength(3);
});

test('a 404 means the QR link is no longer valid', async () => {
  apiService.getJukeboxQueue.mockRejectedValue({ response: { status: 404 } });
  renderQueue();
  expect(await screen.findByText(/no longer valid/i)).toBeInTheDocument();
});

test('a failed first load shows an error with retry', async () => {
  apiService.getJukeboxQueue.mockRejectedValueOnce(new Error('net')).mockResolvedValue({ data: live() });
  renderQueue();
  fireEvent.click(await screen.findByRole('button', { name: /try again/i }));
  expect(await screen.findByText('Current Song')).toBeInTheDocument();
});

test('tracks with a missing title or artist render without crashing or "undefined"', async () => {
  apiService.getJukeboxQueue.mockResolvedValue({ data: live({
    queue: [{ index: 4, id: 10, title: null, artist: null }, { index: 5, id: 11 }],
  }) });
  renderQueue();
  await screen.findByText('Now playing');
  expect(screen.queryByText(/undefined|null|\[object/)).not.toBeInTheDocument();
});

test('in shuffle the section says what is left to play and that the order is random, not "Up next"', async () => {
  apiService.getJukeboxQueue.mockResolvedValue({ data: live({ playbackMode: 'shuffle' }) });
  renderQueue();
  expect(await screen.findByText('Left to play')).toBeInTheDocument();
  expect(screen.getByText(/shuffle is on, so these play in random order/i)).toBeInTheDocument();
  expect(screen.queryByText('Up next')).not.toBeInTheDocument();
});

test('with repeat one on, the queue is labelled Up next but says the current track repeats', async () => {
  apiService.getJukeboxQueue.mockResolvedValue({ data: live({ playbackMode: 'repeat-one' }) });
  renderQueue();
  expect(await screen.findByText('Up next')).toBeInTheDocument();
  expect(screen.getByText(/repeat one is on, so the current track plays again first/i)).toBeInTheDocument();
});

test('other modes, and a server that sends no mode, show a plain Up next with no note', async () => {
  for (const playbackMode of ['off', 'shuffle-scope', 'repeat-all', undefined]) {
    apiService.getJukeboxQueue.mockResolvedValue({ data: live({ playbackMode }) });
    const { unmount } = renderQueue();
    expect(await screen.findByText('Up next')).toBeInTheDocument();
    expect(screen.queryByText(/shuffle is on|repeat one is on/i)).not.toBeInTheDocument();
    unmount();
  }
});

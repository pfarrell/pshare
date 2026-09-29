import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { vi } from 'vitest';
import JukeboxAiMixTab from './JukeboxAiMixTab';

vi.mock('../services/api', () => ({
  apiService: {
    generatePlaylist: vi.fn(),
    getImageUrl: vi.fn(() => '/img/sm/x.jpg'),
  },
}));

const queue = { loading: false, play: vi.fn(), playNext: vi.fn(), addToQueue: vi.fn() };
vi.mock('../hooks/useQueueActions', () => ({ useQueueActions: vi.fn(() => queue) }));

import { apiService } from '../services/api';
import { useQueueActions } from '../hooks/useQueueActions';

const generateResponse = (tracks) => ({
  data: {
    playlist: { name: 'upbeat cleaning music', image_path: null },
    tracks,
  },
});

const someTracks = [
  { id: 1, title: 'Track One', url: '/stream/1', artist: { id: 3, name: 'Some Artist' } },
  { id: 2, title: 'Track Two', url: '/stream/2', artist: { id: 3, name: 'Some Artist' } },
];

const renderTab = (props = {}) =>
  render(
    <MemoryRouter>
      <JukeboxAiMixTab {...props} />
    </MemoryRouter>
  );

beforeEach(() => {
  vi.clearAllMocks();
});

test('Generate is disabled until a prompt is entered', () => {
  renderTab();
  expect(screen.getByRole('button', { name: /generate/i })).toBeDisabled();

  fireEvent.change(screen.getByPlaceholderText(/describe what you want to hear/i), { target: { value: 'upbeat cleaning music' } });

  expect(screen.getByRole('button', { name: /generate/i })).not.toBeDisabled();
});

test('tapping Generate calls generatePlaylist with the prompt and renders results', async () => {
  apiService.generatePlaylist.mockResolvedValue(generateResponse(someTracks));
  renderTab();

  fireEvent.change(screen.getByPlaceholderText(/describe what you want to hear/i), { target: { value: 'upbeat cleaning music' } });
  fireEvent.click(screen.getByRole('button', { name: /generate/i }));

  await waitFor(() => {
    expect(apiService.generatePlaylist).toHaveBeenCalledWith('upbeat cleaning music', 20);
    expect(screen.getByText(/Track One/)).toBeInTheDocument();
    expect(screen.getByText(/Track Two/)).toBeInTheDocument();
  });
});

test('shows the autosaved playlist name and reports it up when the server saved one', async () => {
  const onPlaylistSaved = vi.fn();
  apiService.generatePlaylist.mockResolvedValue({
    data: { playlist: { id: 9, name: 'Sunday Kitchen', image_path: null }, tracks: someTracks },
  });
  renderTab({ onPlaylistSaved });
  fireEvent.change(screen.getByPlaceholderText(/describe what you want to hear/i), { target: { value: 'sunday' } });
  fireEvent.click(screen.getByRole('button', { name: /generate/i }));

  await waitFor(() => expect(screen.getByText(/Saved as playlist: "Sunday Kitchen"/)).toBeInTheDocument());
  expect(onPlaylistSaved).toHaveBeenCalledWith('Sunday Kitchen', 5000);
});

test('shows no saved-name line and reports nothing when the result was not saved (no playlist id)', async () => {
  const onPlaylistSaved = vi.fn();
  apiService.generatePlaylist.mockResolvedValue(generateResponse(someTracks));
  renderTab({ onPlaylistSaved });
  fireEvent.change(screen.getByPlaceholderText(/describe what you want to hear/i), { target: { value: 'x' } });
  fireEvent.click(screen.getByRole('button', { name: /generate/i }));

  await waitFor(() => expect(screen.getByText(/Track One/)).toBeInTheDocument());
  expect(screen.queryByText(/Saved as playlist/)).not.toBeInTheDocument();
  expect(onPlaylistSaved).not.toHaveBeenCalled();
});

test('shows a partial-results note when fewer tracks come back than requested', async () => {
  apiService.generatePlaylist.mockResolvedValue(generateResponse([someTracks[0]]));
  renderTab();

  fireEvent.change(screen.getByPlaceholderText(/describe what you want to hear/i), { target: { value: 'something niche' } });
  fireEvent.click(screen.getByRole('button', { name: /generate/i }));

  await waitFor(() => {
    expect(screen.getByText('Found 1 of 20.')).toBeInTheDocument();
  });
});

test('shows an empty-state message when nothing comes back', async () => {
  apiService.generatePlaylist.mockResolvedValue(generateResponse([]));
  renderTab();

  fireEvent.change(screen.getByPlaceholderText(/describe what you want to hear/i), { target: { value: 'something impossible' } });
  fireEvent.click(screen.getByRole('button', { name: /generate/i }));

  await waitFor(() => {
    expect(screen.getByText("Couldn't find anything matching that — try rephrasing.")).toBeInTheDocument();
  });
});

test('shows an error with retry on failure', async () => {
  apiService.generatePlaylist.mockRejectedValue(new Error('network'));
  renderTab();

  fireEvent.change(screen.getByPlaceholderText(/describe what you want to hear/i), { target: { value: 'upbeat cleaning music' } });
  fireEvent.click(screen.getByRole('button', { name: /generate/i }));

  await waitFor(() => {
    expect(screen.getByText("Couldn't generate right now.")).toBeInTheDocument();
  });
  expect(screen.getByRole('button', { name: /retry/i })).toBeInTheDocument();
});

test('a 429 shows the server rate-limit message with no Retry button', async () => {
  apiService.generatePlaylist.mockRejectedValue({
    response: { status: 429, data: { error: 'Limit of 10 generations per hour reached — try again later.' } },
  });
  renderTab();

  fireEvent.change(screen.getByPlaceholderText(/describe what you want to hear/i), { target: { value: 'upbeat cleaning music' } });
  fireEvent.click(screen.getByRole('button', { name: /generate/i }));

  await waitFor(() => {
    expect(screen.getByText('Limit of 10 generations per hour reached — try again later.')).toBeInTheDocument();
  });
  expect(screen.queryByRole('button', { name: /retry/i })).not.toBeInTheDocument();
  expect(screen.queryByText("Couldn't generate right now.")).not.toBeInTheDocument();
});

describe('loading spinner', () => {
  test('shows a spinner while generating', () => {
    apiService.generatePlaylist.mockReturnValue(new Promise(() => {}));
    renderTab();

    fireEvent.change(screen.getByPlaceholderText(/describe what you want to hear/i), { target: { value: 'upbeat cleaning music' } });
    fireEvent.click(screen.getByRole('button', { name: /generate/i }));

    expect(screen.getByTestId('jukebox-ai-mix-spinner')).toBeInTheDocument();
  });

  test('does not show a spinner before generating starts', () => {
    renderTab();
    expect(screen.queryByTestId('jukebox-ai-mix-spinner')).not.toBeInTheDocument();
  });

  test('hides the spinner once generation finishes', async () => {
    apiService.generatePlaylist.mockResolvedValue(generateResponse(someTracks));
    renderTab();

    fireEvent.change(screen.getByPlaceholderText(/describe what you want to hear/i), { target: { value: 'upbeat cleaning music' } });
    fireEvent.click(screen.getByRole('button', { name: /generate/i }));
    expect(screen.getByTestId('jukebox-ai-mix-spinner')).toBeInTheDocument();

    await waitFor(() => expect(screen.queryByTestId('jukebox-ai-mix-spinner')).not.toBeInTheDocument());
  });
});

test('reports generation in flight via onGeneratingChange (success)', async () => {
  let resolve;
  apiService.generatePlaylist.mockReturnValue(new Promise((r) => { resolve = r; }));
  const onGeneratingChange = vi.fn();
  renderTab({ onGeneratingChange });

  fireEvent.change(screen.getByPlaceholderText(/describe what you want to hear/i), { target: { value: 'upbeat cleaning music' } });
  fireEvent.click(screen.getByRole('button', { name: /generate/i }));

  expect(onGeneratingChange).toHaveBeenCalledTimes(1);
  expect(onGeneratingChange).toHaveBeenLastCalledWith(true);

  resolve(generateResponse(someTracks));

  await waitFor(() => {
    expect(onGeneratingChange).toHaveBeenLastCalledWith(false);
  });
  expect(onGeneratingChange).toHaveBeenCalledTimes(2);
});

test('reports generation in flight via onGeneratingChange (failure)', async () => {
  apiService.generatePlaylist.mockRejectedValue(new Error('network'));
  const onGeneratingChange = vi.fn();
  renderTab({ onGeneratingChange });

  fireEvent.change(screen.getByPlaceholderText(/describe what you want to hear/i), { target: { value: 'upbeat cleaning music' } });
  fireEvent.click(screen.getByRole('button', { name: /generate/i }));

  expect(onGeneratingChange).toHaveBeenLastCalledWith(true);
  await waitFor(() => {
    expect(onGeneratingChange).toHaveBeenLastCalledWith(false);
  });
  expect(onGeneratingChange.mock.calls).toEqual([[true], [false]]);
});

test('Play mix and Add to queue drive the result through the shared queue hook, then onEnqueue', async () => {
  apiService.generatePlaylist.mockResolvedValue(generateResponse(someTracks));
  const onEnqueue = vi.fn();
  renderTab({ onEnqueue });

  fireEvent.change(screen.getByPlaceholderText(/describe what you want to hear/i), { target: { value: 'upbeat cleaning music' } });
  fireEvent.click(screen.getByRole('button', { name: /generate/i }));
  await waitFor(() => screen.getByText(/Track One/));

  const [source] = useQueueActions.mock.calls.at(-1);
  expect(source.map((t) => t.id)).toEqual([1, 2]);

  fireEvent.click(screen.getByRole('button', { name: 'Play mix' }));
  expect(queue.play).toHaveBeenCalledTimes(1);
  expect(onEnqueue).toHaveBeenCalledTimes(1);

  fireEvent.click(screen.getByRole('button', { name: 'Add to queue' }));
  expect(queue.addToQueue).toHaveBeenCalledTimes(1);
  expect(onEnqueue).toHaveBeenCalledTimes(2);
});

test('a mix the server autosaved queues as that playlist (so plays log its id)', async () => {
  apiService.generatePlaylist.mockResolvedValue({
    data: { playlist: { id: 9, name: 'Sunday Kitchen', image_path: null }, tracks: someTracks },
  });
  renderTab();
  fireEvent.change(screen.getByPlaceholderText(/describe what you want to hear/i), { target: { value: 'sunday' } });
  fireEvent.click(screen.getByRole('button', { name: /generate/i }));
  await waitFor(() => screen.getByText(/Track One/));

  const [, options] = useQueueActions.mock.calls.at(-1);
  expect(options.queueSource).toEqual({ type: 'playlist', id: 9 });
});

test('a mix with no saved playlist id keeps the ai-mix queue source', async () => {
  apiService.generatePlaylist.mockResolvedValue(generateResponse(someTracks));
  renderTab();
  fireEvent.change(screen.getByPlaceholderText(/describe what you want to hear/i), { target: { value: 'sunday' } });
  fireEvent.click(screen.getByRole('button', { name: /generate/i }));
  await waitFor(() => screen.getByText(/Track One/));

  const [, options] = useQueueActions.mock.calls.at(-1);
  expect(options.queueSource).toEqual({ type: 'ai-mix', id: 'sunday' });
});

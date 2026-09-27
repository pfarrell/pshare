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

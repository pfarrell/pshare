// src/jukebox/JukeboxSavePlaylistModal.test.jsx
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { vi } from 'vitest';
import JukeboxSavePlaylistModal from './JukeboxSavePlaylistModal';

vi.mock('../services/api', () => ({
  apiService: { suggestPlaylistName: vi.fn(), createPlaylist: vi.fn() },
}));

import { apiService } from '../services/api';

beforeEach(() => {
  apiService.suggestPlaylistName.mockReset();
  apiService.createPlaylist.mockReset();
});

test('requests a suggested name for the given track ids on mount', () => {
  apiService.suggestPlaylistName.mockReturnValue(new Promise(() => {}));
  render(<JukeboxSavePlaylistModal trackIds={[1, 2, 3]} onClose={vi.fn()} onSaved={vi.fn()} />);
  expect(apiService.suggestPlaylistName).toHaveBeenCalledWith([1, 2, 3]);
});

test('pre-fills the name input once a suggestion comes back', async () => {
  apiService.suggestPlaylistName.mockResolvedValue({ data: { name: 'Sunset Drive' } });
  render(<JukeboxSavePlaylistModal trackIds={[1, 2, 3]} onClose={vi.fn()} onSaved={vi.fn()} />);
  await waitFor(() => expect(screen.getByRole('textbox')).toHaveValue('Sunset Drive'));
});

test('falls back to a default name if the suggestion fails, without blocking save', async () => {
  apiService.suggestPlaylistName.mockRejectedValue(new Error('network'));
  apiService.createPlaylist.mockResolvedValue({ data: { id: 1, name: 'fallback' } });
  const onSaved = vi.fn();
  render(<JukeboxSavePlaylistModal trackIds={[1, 2, 3]} onClose={vi.fn()} onSaved={onSaved} />);

  await waitFor(() => expect(screen.getByRole('textbox').value.length).toBeGreaterThan(0));
  fireEvent.click(screen.getByText('Save'));

  await waitFor(() => expect(onSaved).toHaveBeenCalled());
});

test('a name typed before the suggestion resolves is not overwritten by it', async () => {
  let resolveSuggestion;
  apiService.suggestPlaylistName.mockReturnValue(new Promise((resolve) => { resolveSuggestion = resolve; }));
  render(<JukeboxSavePlaylistModal trackIds={[1, 2, 3]} onClose={vi.fn()} onSaved={vi.fn()} />);

  fireEvent.change(screen.getByRole('textbox'), { target: { value: 'My Own Name' } });
  resolveSuggestion({ data: { name: 'Sunset Drive' } });

  await waitFor(() => expect(apiService.suggestPlaylistName).toHaveBeenCalled());
  expect(screen.getByRole('textbox')).toHaveValue('My Own Name');
});

test('rejects an empty title without calling createPlaylist', async () => {
  apiService.suggestPlaylistName.mockResolvedValue({ data: { name: '' } });
  render(<JukeboxSavePlaylistModal trackIds={[1, 2, 3]} onClose={vi.fn()} onSaved={vi.fn()} />);
  await waitFor(() => expect(apiService.suggestPlaylistName).toHaveBeenCalled());

  fireEvent.click(screen.getByText('Save'));

  expect(screen.getByText('Please enter a playlist name')).toBeInTheDocument();
  expect(apiService.createPlaylist).not.toHaveBeenCalled();
});

test('submits the trimmed name and track ids, then reports success and closes', async () => {
  apiService.suggestPlaylistName.mockResolvedValue({ data: { name: 'Sunset Drive' } });
  apiService.createPlaylist.mockResolvedValue({ data: { id: 42, name: 'Sunset Drive' } });
  const onClose = vi.fn();
  const onSaved = vi.fn();
  render(<JukeboxSavePlaylistModal trackIds={[1, 2, 3]} onClose={onClose} onSaved={onSaved} />);
  await waitFor(() => expect(screen.getByRole('textbox')).toHaveValue('Sunset Drive'));

  fireEvent.click(screen.getByText('Save'));

  await waitFor(() => {
    expect(apiService.createPlaylist).toHaveBeenCalledWith('Sunset Drive', [1, 2, 3]);
    expect(onSaved).toHaveBeenCalledWith('Sunset Drive');
    expect(onClose).toHaveBeenCalled();
  });
});

test('on save failure, shows an inline error, keeps the modal open, and re-enables Save', async () => {
  apiService.suggestPlaylistName.mockResolvedValue({ data: { name: 'Sunset Drive' } });
  apiService.createPlaylist.mockRejectedValue(new Error('network error'));
  const onClose = vi.fn();
  render(<JukeboxSavePlaylistModal trackIds={[1, 2, 3]} onClose={onClose} onSaved={vi.fn()} />);
  await waitFor(() => expect(screen.getByRole('textbox')).toHaveValue('Sunset Drive'));

  fireEvent.click(screen.getByText('Save'));

  await waitFor(() => expect(screen.getByText('Failed to save playlist')).toBeInTheDocument());
  expect(onClose).not.toHaveBeenCalled();
  expect(screen.getByText('Save')).not.toBeDisabled();
});

test('clicking Cancel calls onClose without saving', async () => {
  apiService.suggestPlaylistName.mockResolvedValue({ data: { name: 'Sunset Drive' } });
  const onClose = vi.fn();
  render(<JukeboxSavePlaylistModal trackIds={[1, 2, 3]} onClose={onClose} onSaved={vi.fn()} />);

  fireEvent.click(screen.getByText('Cancel'));

  expect(onClose).toHaveBeenCalled();
  expect(apiService.createPlaylist).not.toHaveBeenCalled();
});

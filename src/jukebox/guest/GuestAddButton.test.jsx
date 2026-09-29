import { screen, fireEvent, waitFor } from '@testing-library/react';
import GuestAddButton from './GuestAddButton';
import { renderGuest } from './testUtils';
import { apiService } from '../../services/api';

vi.mock('../../services/api', () => ({
  apiService: { submitToJukebox: vi.fn(), guestTrackIds: vi.fn(), guestRandomTracks: vi.fn() },
}));

const renderButton = (props) =>
  renderGuest(<GuestAddButton itemKey="k" label="Song" {...props} />, { path: '/', route: '/' });

beforeEach(() => {
  vi.clearAllMocks();
  localStorage.setItem('jukebox-guest-name', 'Riley');
  apiService.submitToJukebox.mockResolvedValue({ data: [] });
});

test('adding known track ids submits them and shows a check', async () => {
  renderButton({ trackIds: [7] });
  fireEvent.click(screen.getByRole('button', { name: 'Add Song to queue' }));

  await waitFor(() => expect(apiService.submitToJukebox).toHaveBeenCalledWith('tok', [7], 'Riley'));
  expect(await screen.findByText('✓')).toBeInTheDocument();
});

test('album and playlist kinds add the whole thing through the track-ids endpoint', async () => {
  apiService.guestTrackIds.mockResolvedValue({ data: { trackIds: [1, 2] } });
  renderButton({ kind: 'album', id: 5, variant: 'all', label: 'Album' });
  const button = screen.getByRole('button', { name: 'Add Album to queue' });
  expect(button).toHaveTextContent('Add all');
  fireEvent.click(button);

  await waitFor(() => expect(apiService.guestTrackIds).toHaveBeenCalledWith('tok', 'album', 5));
  await waitFor(() => expect(apiService.submitToJukebox).toHaveBeenCalledWith('tok', [1, 2], 'Riley'));
  expect(await screen.findByText('Added')).toBeInTheDocument();
});

test('artist and collection kinds shuffle a random batch instead of adding everything', async () => {
  apiService.guestRandomTracks.mockResolvedValue({ data: { trackIds: [3, 4, 5] } });
  renderButton({ kind: 'collection', id: 8, variant: 'all', label: 'Seventies' });
  const button = screen.getByRole('button', { name: 'Add random tracks from Seventies' });
  expect(button).toHaveTextContent('Shuffle');
  fireEvent.click(button);

  await waitFor(() => expect(apiService.guestRandomTracks).toHaveBeenCalledWith('tok', 'collection', 8));
  await waitFor(() => expect(apiService.submitToJukebox).toHaveBeenCalledWith('tok', [3, 4, 5], 'Riley'));
  expect(apiService.guestTrackIds).not.toHaveBeenCalled();
});

test('an empty entity reports nothing to add instead of claiming success', async () => {
  apiService.guestTrackIds.mockResolvedValue({ data: { trackIds: [] } });
  renderButton({ kind: 'playlist', id: 9, variant: 'all', label: 'Mix' });
  fireEvent.click(screen.getByRole('button', { name: 'Add Mix to queue' }));

  expect(await screen.findByText('Nothing to add')).toBeInTheDocument();
  expect(apiService.submitToJukebox).not.toHaveBeenCalled();
});

test('a 429 shows the slow-down message', async () => {
  apiService.submitToJukebox.mockRejectedValue({ response: { status: 429 } });
  renderButton({ trackIds: [1], variant: 'all' });
  fireEvent.click(screen.getByRole('button', { name: 'Add Song to queue' }));

  expect(await screen.findByText('Slow down, try again in a moment')).toBeInTheDocument();
});

test('tapping the button does not trigger a surrounding link', async () => {
  const onClick = vi.fn();
  renderGuest(<a href="#x" onClick={onClick}><GuestAddButton itemKey="k" label="S" trackIds={[1]} /></a>, { path: '/', route: '/' });
  fireEvent.click(screen.getByRole('button'));
  expect(onClick).not.toHaveBeenCalled();
});

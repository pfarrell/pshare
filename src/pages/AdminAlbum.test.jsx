import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import AdminAlbum from './AdminAlbum';
import { apiService } from '../services/api';
import { useUnsavedChangesStore } from '../stores/unsavedChangesStore';

vi.mock('../components/TagsSection', () => ({ default: () => null }));
vi.mock('../services/api', () => ({
  apiService: {
    getAlbum: vi.fn(),
    getAlbumSecondaryArtists: vi.fn(),
    updateAlbum: vi.fn(),
    updateTrack: vi.fn(),
    searchAdminArtists: vi.fn(),
    getReprocessPreview: vi.fn(),
    makeTrackSingle: vi.fn(),
    deleteAlbum: vi.fn(),
    getImageUrl: vi.fn(() => ''),
    entityImages: {
      album: { list: vi.fn(), add: vi.fn(), setPrimary: vi.fn(), remove: vi.fn() },
    },
  },
}));

const albumPayload = {
  album: {
    id: 10,
    title: 'Easy Rider',
    artist_id: 161,
    is_compilation: true,
    release_year: '1969',
    image_path: null,
    wikipedia: null,
    musicbrainz_id: null,
    mbid_status: null,
  },
  artist: { id: 161, name: 'Various Artists' },
  tracks: [
    { id: 1, title: 'Born to Be Wild', track_number: '1', duration: 180, album: { id: 10 }, artist: { id: 200, name: 'Steppenwolf' } },
  ],
};

const renderAdminAlbum = () =>
  render(
    <MemoryRouter initialEntries={['/admin/album/10']}>
      <Routes>
        <Route path="/admin/album/:id" element={<AdminAlbum />} />
      </Routes>
    </MemoryRouter>
  );

beforeEach(() => {
  vi.clearAllMocks();
  apiService.getAlbum.mockResolvedValue({ data: albumPayload });
  apiService.entityImages.album.list.mockResolvedValue({ data: [] });
  apiService.getAlbumSecondaryArtists.mockResolvedValue({ data: [] });
});

describe('AdminAlbum — compilation checkbox', () => {
  test('reflects the loaded is_compilation value', async () => {
    renderAdminAlbum();
    const checkbox = await screen.findByLabelText('Is compilation');
    expect(checkbox).toBeChecked();
  });

  test('saving sends the toggled is_compilation value', async () => {
    apiService.updateAlbum.mockResolvedValue({ data: {} });
    const user = userEvent.setup();
    renderAdminAlbum();

    const checkbox = await screen.findByLabelText('Is compilation');
    await user.click(checkbox);

    await user.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() => expect(apiService.updateAlbum).toHaveBeenCalledWith(
      '10',
      expect.objectContaining({ is_compilation: false })
    ));
  });

  test('checking the checkbox locks the Artist ID field to 161', async () => {
    apiService.getAlbum.mockResolvedValue({
      data: { ...albumPayload, album: { ...albumPayload.album, is_compilation: false, artist_id: 5 } },
    });
    const user = userEvent.setup();
    renderAdminAlbum();

    const checkbox = await screen.findByLabelText('Is compilation');
    expect(checkbox).not.toBeChecked();
    const artistInput = screen.getByLabelText('Artist ID *');
    expect(artistInput).not.toBeDisabled();

    await user.click(checkbox);

    expect(artistInput).toBeDisabled();
    expect(artistInput).toHaveValue(161);
  });

  test('saving includes a manually-pasted MusicBrainz id in the update payload', async () => {
    apiService.updateAlbum.mockResolvedValue({ data: {} });
    const user = userEvent.setup();
    renderAdminAlbum();
    await screen.findByLabelText('Is compilation');

    await user.type(
      screen.getByPlaceholderText('Paste MusicBrainz ID or URL'),
      'https://musicbrainz.org/release/0e8e1b3b-388f-4404-900e-db88c3b47c2a'
    );
    await user.click(screen.getByRole('button', { name: 'Use' }));
    await user.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() =>
      expect(apiService.updateAlbum).toHaveBeenCalledWith(
        '10',
        expect.objectContaining({
          musicbrainz_id: 'https://musicbrainz.org/release/0e8e1b3b-388f-4404-900e-db88c3b47c2a',
        })
      )
    );
  });
});

describe('AdminAlbum — per-track artist picker', () => {
  test('shows the current track artist name', async () => {
    renderAdminAlbum();
    await screen.findByDisplayValue('Easy Rider');
    expect(screen.getByText('Steppenwolf')).toBeInTheDocument();
  });

  test('picking a new artist saves it via updateTrack', async () => {
    apiService.updateTrack.mockResolvedValue({ data: {} });
    apiService.searchAdminArtists.mockResolvedValue({ data: [{ id: 300, name: 'The Electric Prunes' }] });
    const user = userEvent.setup();
    renderAdminAlbum();

    await screen.findByDisplayValue('Easy Rider');
    await user.click(screen.getByRole('button', { name: 'Change' }));
    const artistInput = screen.getByPlaceholderText('Search artist name...');
    await user.type(artistInput, 'Electric');
    await user.click(within(artistInput.closest('div')).getByRole('button', { name: 'Search' }));
    await screen.findByText('The Electric Prunes');
    await user.click(screen.getByText('The Electric Prunes'));

    expect(apiService.updateTrack).toHaveBeenCalledWith(1, { artist_id: 300 });
  });
});

describe('AdminAlbum — reprocess from files', () => {
  test('opens the reprocess modal and reloads album data after apply', async () => {
    apiService.getReprocessPreview.mockResolvedValue({
      data: {
        album: { id: 10, is_compilation: true, fields: { title: { current: 'Easy Rider', proposed: 'Easy Rider' }, release_year: { current: 1969, proposed: 1969 } } },
        tracks: [],
        skipped: [],
      },
    });
    const user = userEvent.setup();
    renderAdminAlbum();

    await screen.findByDisplayValue('Easy Rider');
    await user.click(screen.getByRole('button', { name: 'Reprocess from Files' }));

    await waitFor(() => expect(apiService.getReprocessPreview).toHaveBeenCalledWith('10'));
    expect(await screen.findByText('Reprocess Album From Files')).toBeInTheDocument();
  });
});

describe('AdminAlbum — Make Single', () => {
  test('confirms, calls makeTrackSingle, and removes the track from the table', async () => {
    window.confirm = vi.fn(() => true);
    apiService.makeTrackSingle.mockResolvedValue({ data: {} });
    const user = userEvent.setup();
    renderAdminAlbum();

    await screen.findByDisplayValue('Easy Rider');
    await user.click(screen.getByRole('button', { name: 'Make Single' }));

    expect(window.confirm).toHaveBeenCalledWith(
      'Remove "Born to Be Wild" from this album and register it as a single for Steppenwolf?'
    );
    await waitFor(() => expect(apiService.makeTrackSingle).toHaveBeenCalledWith(1));
    await waitFor(() => expect(screen.queryByDisplayValue('Born to Be Wild')).not.toBeInTheDocument());
  });

  test('does nothing when the confirm dialog is dismissed', async () => {
    window.confirm = vi.fn(() => false);
    const user = userEvent.setup();
    renderAdminAlbum();

    await screen.findByDisplayValue('Easy Rider');
    await user.click(screen.getByRole('button', { name: 'Make Single' }));

    expect(apiService.makeTrackSingle).not.toHaveBeenCalled();
  });

  test('handles null artist name gracefully', async () => {
    apiService.getAlbum.mockResolvedValue({
      data: {
        ...albumPayload,
        tracks: [
          { id: 1, title: 'Born to Be Wild', track_number: '1', duration: 180, album: { id: 10 }, artist: { id: null, name: undefined } },
        ],
      },
    });
    window.confirm = vi.fn(() => true);
    apiService.makeTrackSingle.mockResolvedValue({ data: {} });
    const user = userEvent.setup();
    renderAdminAlbum();

    await screen.findByDisplayValue('Easy Rider');
    await user.click(screen.getByRole('button', { name: 'Make Single' }));

    expect(window.confirm).toHaveBeenCalledWith(
      'Remove "Born to Be Wild" from this album and register it as a single for this artist?'
    );
    await waitFor(() => expect(apiService.makeTrackSingle).toHaveBeenCalledWith(1));
    await waitFor(() => expect(screen.queryByDisplayValue('Born to Be Wild')).not.toBeInTheDocument());
  });

  test('does not render the Make Single button when the loaded album is the _Singles pseudo-album', async () => {
    apiService.getAlbum.mockResolvedValue({
      data: {
        ...albumPayload,
        album: { ...albumPayload.album, title: '_Singles' },
      },
    });
    renderAdminAlbum();

    await screen.findByDisplayValue('_Singles');
    expect(screen.queryByRole('button', { name: 'Make Single' })).not.toBeInTheDocument();
  });
});

describe('AdminAlbum — unsavedChangesStore registration', () => {
  test('registers unsaved changes when a field is edited, clears on unmount', async () => {
    const user = userEvent.setup();
    const { unmount } = renderAdminAlbum();
    const titleInput = await screen.findByDisplayValue('Easy Rider');

    expect(useUnsavedChangesStore.getState().hasUnsavedChanges).toBe(false);

    await user.type(titleInput, ' Extra');
    await waitFor(() => expect(useUnsavedChangesStore.getState().hasUnsavedChanges).toBe(true));
    expect(useUnsavedChangesStore.getState().save).toBeInstanceOf(Function);

    unmount();
    expect(useUnsavedChangesStore.getState().hasUnsavedChanges).toBe(false);
    expect(useUnsavedChangesStore.getState().save).toBe(null);
  });

  test('the registered save function persists the edited fields', async () => {
    apiService.updateAlbum.mockResolvedValue({ data: {} });
    const user = userEvent.setup();
    renderAdminAlbum();
    const titleInput = await screen.findByDisplayValue('Easy Rider');

    await user.type(titleInput, ' Extra');
    await waitFor(() => expect(useUnsavedChangesStore.getState().hasUnsavedChanges).toBe(true));

    await useUnsavedChangesStore.getState().save();

    expect(apiService.updateAlbum).toHaveBeenCalledWith(
      '10',
      expect.objectContaining({ title: 'Easy Rider Extra' })
    );
  });
});

describe('AdminAlbum — delete confirmation', () => {
  test('clicking Delete opens a type-to-confirm modal showing the track blast radius, and does not call the API until confirmed', async () => {
    const user = userEvent.setup();
    renderAdminAlbum();
    await screen.findByDisplayValue('Easy Rider');

    await user.click(screen.getByRole('button', { name: 'Delete Album' }));

    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByText('Delete "Easy Rider" and 1 track? This cannot be undone.')).toBeInTheDocument();
    expect(apiService.deleteAlbum).not.toHaveBeenCalled();

    await user.click(within(dialog).getByRole('button', { name: 'Delete' }));
    expect(apiService.deleteAlbum).not.toHaveBeenCalled();
  });

  test('typing "delete me" and confirming deletes the album and navigates home', async () => {
    apiService.deleteAlbum.mockResolvedValue({});
    const user = userEvent.setup();
    renderAdminAlbum();
    await screen.findByDisplayValue('Easy Rider');

    await user.click(screen.getByRole('button', { name: 'Delete Album' }));
    const dialog = await screen.findByRole('dialog');
    await user.type(within(dialog).getByRole('textbox'), 'delete me');
    await user.click(within(dialog).getByRole('button', { name: 'Delete' }));

    await waitFor(() => expect(apiService.deleteAlbum).toHaveBeenCalledWith('10'));
  });
});

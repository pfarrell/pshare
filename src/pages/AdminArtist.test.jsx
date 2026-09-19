import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Routes, Route, useParams } from 'react-router-dom';
import AdminArtist from './AdminArtist';
import { apiService } from '../services/api';
import { useUnsavedChangesStore } from '../stores/unsavedChangesStore';

vi.mock('../components/TagsSection', () => ({ default: () => null }));
vi.mock('../services/api', () => ({
  apiService: {
    getArtist: vi.fn(),
    getArtistSecondaryAlbums: vi.fn(),
    getRelatedArtists: vi.fn(),
    search: vi.fn(),
    searchAdminArtists: vi.fn(),
    previewArtistStubs: vi.fn(),
    mergeArtists: vi.fn(),
    createArtist: vi.fn(),
    updateArtist: vi.fn(),
    deleteArtist: vi.fn(),
    addRelatedArtist: vi.fn(),
    getImageUrl: vi.fn(() => ''),
    entityImages: {
      artist: { list: vi.fn(), add: vi.fn(), setPrimary: vi.fn(), remove: vi.fn() },
    },
  },
}));

const TargetArtistPage = () => {
  const { id } = useParams();
  return <div>Target artist page: {id}</div>;
};

const renderAdminArtist = () =>
  render(
    <MemoryRouter initialEntries={['/admin/artist/5']}>
      <Routes>
        <Route path="/admin/artist/:id" element={<AdminArtist />} />
        <Route path="/artist/:id" element={<TargetArtistPage />} />
      </Routes>
    </MemoryRouter>
  );

beforeEach(() => {
  apiService.getArtist.mockResolvedValue({
    data: {
      artist: { id: 5, name: 'EWF', image_path: null, wikipedia: '', musicbrainz_id: null, mbid_status: null },
      albums: [{ id: 1, track_count: 10 }, { id: 2, track_count: 4 }],
    },
  });
  apiService.entityImages.artist.list.mockResolvedValue({ data: [] });
  apiService.getArtistSecondaryAlbums.mockResolvedValue({ data: [] });
  apiService.getRelatedArtists.mockResolvedValue({ data: [] });
  vi.spyOn(window, 'confirm').mockReturnValue(true);
});

describe('AdminArtist — unified merge section', () => {
  test('renders the unified section and no longer renders the old separate sections', async () => {
    renderAdminArtist();
    await screen.findByText('Merge With Another Artist');

    expect(screen.queryByRole('button', { name: 'Merge Stubs' })).not.toBeInTheDocument();
    expect(screen.queryByText('Move All Artifacts to Another Artist')).not.toBeInTheDocument();
  });

  test('"Suggest possible duplicates" lists candidates and merges the selected ones into this artist', async () => {
    apiService.previewArtistStubs.mockResolvedValue({
      data: [{ id: 99, name: 'E.W.F.', album_count: 0, similarity: 0.6 }],
    });
    apiService.mergeArtists.mockResolvedValue({ data: { success: true, merged: 1 } });
    const user = userEvent.setup();
    renderAdminArtist();
    await screen.findByText('Merge With Another Artist');

    await user.click(screen.getByRole('button', { name: 'Suggest possible duplicates' }));
    await screen.findByText('E.W.F.');

    await user.click(screen.getByRole('button', { name: /Merge 1 selected into "EWF"/ }));

    await waitFor(() => expect(apiService.mergeArtists).toHaveBeenCalledWith('5', [99]));
  });

  test('manual search defaults to keeping whichever artist has more albums, and merging deletes the other', async () => {
    // Fixture: "this" artist (EWF, id 5) has 2 albums (see beforeEach), the
    // found target has 14 — the default should keep the target and delete EWF.
    apiService.searchAdminArtists.mockResolvedValue({
      data: [{ id: 200, name: 'Earth, Wind & Fire', album_count: 14 }],
    });
    apiService.mergeArtists.mockResolvedValue({ data: { success: true, merged: 1 } });
    const user = userEvent.setup();
    renderAdminArtist();
    await screen.findByText('Merge With Another Artist');

    await user.type(screen.getByPlaceholderText('Search for another artist...'), 'Earth Wind');
    await user.click(screen.getByRole('button', { name: 'Search' }));
    await user.click(await screen.findByText('Earth, Wind & Fire'));

    expect(screen.getByLabelText(/Keep "Earth, Wind & Fire"/)).toBeChecked();

    await user.click(screen.getByRole('button', { name: 'Merge' }));

    await waitFor(() => expect(apiService.mergeArtists).toHaveBeenCalledWith(200, ['5']));
    await screen.findByText('Target artist page: 200');
  });

  test('overriding the direction keeps this artist and merges the found one into it instead', async () => {
    apiService.searchAdminArtists.mockResolvedValue({
      data: [{ id: 200, name: 'Earth, Wind & Fire', album_count: 14 }],
    });
    apiService.mergeArtists.mockResolvedValue({ data: { success: true, merged: 1 } });
    const user = userEvent.setup();
    renderAdminArtist();
    await screen.findByText('Merge With Another Artist');

    await user.type(screen.getByPlaceholderText('Search for another artist...'), 'Earth Wind');
    await user.click(screen.getByRole('button', { name: 'Search' }));
    await user.click(await screen.findByText('Earth, Wind & Fire'));

    await user.click(screen.getByLabelText(/Keep this artist \("EWF"\)/));
    await user.click(screen.getByRole('button', { name: 'Merge' }));

    await waitFor(() => expect(apiService.mergeArtists).toHaveBeenCalledWith('5', [200]));
  });

  test('typing a name with no matches offers create-and-merge, which creates then merges and redirects', async () => {
    apiService.searchAdminArtists.mockResolvedValue({ data: [] });
    apiService.createArtist.mockResolvedValue({ data: { id: 300, name: 'Earth, Wind and Fire' } });
    apiService.mergeArtists.mockResolvedValue({ data: { success: true, merged: 1 } });
    const user = userEvent.setup();
    renderAdminArtist();
    await screen.findByText('Merge With Another Artist');

    await user.type(screen.getByPlaceholderText('Search for another artist...'), 'Earth Wind and Fire');
    await user.click(screen.getByRole('button', { name: 'Search' }));

    const createButton = await screen.findByRole('button', { name: 'Create "Earth Wind and Fire" & merge this artist into it' });
    await user.click(createButton);

    await waitFor(() => expect(apiService.createArtist).toHaveBeenCalledWith('Earth Wind and Fire'));
    await waitFor(() => expect(apiService.mergeArtists).toHaveBeenCalledWith(300, ['5']));
    await screen.findByText('Target artist page: 300');
  });

  test('saving includes a manually-pasted MusicBrainz id in the update payload', async () => {
    apiService.updateArtist.mockResolvedValue({ data: {} });
    const user = userEvent.setup();
    renderAdminArtist();
    await screen.findByText('Merge With Another Artist');

    await user.type(
      screen.getByPlaceholderText('Paste MusicBrainz ID or URL'),
      '0e8e1b3b-388f-4404-900e-db88c3b47c2a'
    );
    await user.click(screen.getByRole('button', { name: 'Use' }));
    await user.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() =>
      expect(apiService.updateArtist).toHaveBeenCalledWith(
        '5',
        expect.objectContaining({ musicbrainz_id: '0e8e1b3b-388f-4404-900e-db88c3b47c2a' })
      )
    );
  });
});

describe('AdminArtist — unsavedChangesStore registration', () => {
  test('registers unsaved changes when a field is edited, clears on unmount', async () => {
    const user = userEvent.setup();
    const { unmount } = renderAdminArtist();
    const nameInput = await screen.findByDisplayValue('EWF');

    expect(useUnsavedChangesStore.getState().hasUnsavedChanges).toBe(false);

    await user.type(nameInput, ' Extra');
    await waitFor(() => expect(useUnsavedChangesStore.getState().hasUnsavedChanges).toBe(true));
    expect(useUnsavedChangesStore.getState().save).toBeInstanceOf(Function);

    unmount();
    expect(useUnsavedChangesStore.getState().hasUnsavedChanges).toBe(false);
    expect(useUnsavedChangesStore.getState().save).toBe(null);
  });

  test('the registered save function persists the edited fields', async () => {
    apiService.updateArtist.mockResolvedValue({ data: {} });
    const user = userEvent.setup();
    renderAdminArtist();
    const nameInput = await screen.findByDisplayValue('EWF');

    await user.type(nameInput, ' Extra');
    await waitFor(() => expect(useUnsavedChangesStore.getState().hasUnsavedChanges).toBe(true));

    await useUnsavedChangesStore.getState().save();

    expect(apiService.updateArtist).toHaveBeenCalledWith(
      '5',
      expect.objectContaining({ name: 'EWF Extra' })
    );
  });
});

describe('AdminArtist — delete confirmation', () => {
  test('clicking Delete opens a type-to-confirm modal showing the album/track blast radius, and does not call the API until confirmed', async () => {
    const user = userEvent.setup();
    renderAdminArtist();
    await screen.findByDisplayValue('EWF');

    await user.click(screen.getByRole('button', { name: 'Delete Artist' }));

    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByText('Delete "EWF" and 2 albums, 14 tracks? This cannot be undone.')).toBeInTheDocument();
    expect(apiService.deleteArtist).not.toHaveBeenCalled();

    await user.click(within(dialog).getByRole('button', { name: 'Delete' }));
    expect(apiService.deleteArtist).not.toHaveBeenCalled();
  });

  test('typing "delete me" and confirming deletes the artist and navigates home', async () => {
    apiService.deleteArtist.mockResolvedValue({});
    const user = userEvent.setup();
    renderAdminArtist();
    await screen.findByDisplayValue('EWF');

    await user.click(screen.getByRole('button', { name: 'Delete Artist' }));
    const dialog = await screen.findByRole('dialog');
    await user.type(within(dialog).getByRole('textbox'), 'delete me');
    await user.click(within(dialog).getByRole('button', { name: 'Delete' }));

    await waitFor(() => expect(apiService.deleteArtist).toHaveBeenCalledWith('5'));
  });
});

describe('AdminArtist — count pluralization', () => {
  test('shows "1 album" (singular) when the API returns album_count as the string "1"', async () => {
    apiService.searchAdminArtists.mockResolvedValue({ data: [{ id: 999, name: 'Other Artist', album_count: '1' }] });
    const user = userEvent.setup();
    renderAdminArtist();
    const input = await screen.findByPlaceholderText('Search for another artist...');
    await user.type(input, 'Other');
    await user.click(within(input.closest('form')).getByRole('button', { name: 'Search' }));
    expect(await screen.findByText('1 album · ID 999')).toBeInTheDocument();
  });
});

describe('AdminArtist — add relation search', () => {
  test('"Similar Artist (Manual)" searches artists, not albums', async () => {
    apiService.searchAdminArtists.mockResolvedValue({ data: [{ id: 42, name: 'Kool & the Gang', album_count: 3 }] });
    apiService.search.mockResolvedValue({ data: { results: [], tracks: [] } });
    const user = userEvent.setup();
    renderAdminArtist();
    await user.click(await screen.findByRole('button', { name: '+ Add Relation' }));
    await user.selectOptions(screen.getByDisplayValue('Related Artist'), 'similar_artist');
    await user.type(screen.getByPlaceholderText('Search artist name...'), 'Kool');
    await user.click(within(screen.getByPlaceholderText('Search artist name...').closest('form')).getByRole('button', { name: 'Search' }));
    expect(apiService.searchAdminArtists).toHaveBeenCalledWith('Kool');
    expect(apiService.search).not.toHaveBeenCalled();
    expect(await screen.findByText('Kool & the Gang')).toBeInTheDocument();
  });
});

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import AdminTrack from './AdminTrack';
import { apiService } from '../services/api';
import { useUnsavedChangesStore } from '../stores/unsavedChangesStore';

vi.mock('../services/api', () => ({
  apiService: {
    getTrackAdminDetail: vi.fn(),
    updateTrack: vi.fn(),
    updateTrackRecordingMbid: vi.fn(),
    addTrackCollaborator: vi.fn(),
    removeTrackCollaborator: vi.fn(),
    searchAdminArtists: vi.fn(),
    getTrackMusicbrainzPreview: vi.fn(),
  },
}));

const mockDetail = {
  track: {
    id: 1, title: 'Test Track', track_number: '3', release_year: '1999',
    album_id: 10, artist_id: 20, media_file_id: 30, wikipedia: '',
    duration_sec: 210, approved: true,
    created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-02T00:00:00Z',
  },
  mediaFile: {
    id: 30, absolute_path: '/music/artist/album/track.mp3', name: 'track.mp3',
    file_type: 'mp3', file_hash: 'abc123', chromaprint_fingerprint: 'AQAB...',
    chromaprint_duration_sec: 210, imported_date: '2026-01-01T00:00:00Z',
    last_modified: '2026-01-01T00:00:00Z', musicbrainz_recording_id: null,
    mbid_status: 'unmatched', mbid_confidence: null,
  },
  album: { id: 10, title: 'Test Album', musicbrainz_id: 'release-uuid-1' },
  artist: { id: 20, name: 'Test Artist' },
  collaborators: [],
};

const renderPage = () => render(
  <MemoryRouter initialEntries={['/admin/track/1']}>
    <Routes>
      <Route path="/admin/track/:id" element={<AdminTrack />} />
      <Route path="/album/:id" element={<div>Album Page 10</div>} />
    </Routes>
  </MemoryRouter>
);

describe('AdminTrack', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    apiService.getTrackAdminDetail.mockResolvedValue({ data: mockDetail });
  });

  it('fetches and renders the track title field', async () => {
    renderPage();
    await waitFor(() => expect(apiService.getTrackAdminDetail).toHaveBeenCalledWith('1'));
    expect(await screen.findByDisplayValue('Test Track')).toBeInTheDocument();
  });

  it('saves edited fields via updateTrack', async () => {
    apiService.updateTrack.mockResolvedValue({ data: { ...mockDetail.track, title: 'New Title' } });
    renderPage();
    const titleInput = await screen.findByDisplayValue('Test Track');
    fireEvent.change(titleInput, { target: { value: 'New Title' } });
    fireEvent.click(screen.getByText('Save'));
    await waitFor(() => expect(apiService.updateTrack).toHaveBeenCalledWith('1', expect.objectContaining({ title: 'New Title' })));
  });

  it('renders read-only media file info', async () => {
    renderPage();
    expect(await screen.findByText('/music/artist/album/track.mp3')).toBeInTheDocument();
    expect(screen.getByText('abc123')).toBeInTheDocument();
  });

  it('adds a collaborator immediately (not batched with Save)', async () => {
    apiService.addTrackCollaborator.mockResolvedValue({
      data: { id: 99, track_id: 1, artist_id: 40, role: 'featured', order: 1 },
    });
    apiService.searchAdminArtists.mockResolvedValue({ data: [{ id: 40, name: 'Collab Artist' }] });
    renderPage();
    await screen.findByDisplayValue('Test Track');

    fireEvent.click(screen.getByText('Add Collaborator'));
    fireEvent.change(screen.getByPlaceholderText('Search artist name...'), { target: { value: 'Collab' } });
    fireEvent.click(screen.getByText('Search', { selector: 'button' }));
    await waitFor(() => expect(screen.getByText('Collab Artist')).toBeInTheDocument());
    fireEvent.click(screen.getByText('Collab Artist'));

    await waitFor(() => expect(apiService.addTrackCollaborator).toHaveBeenCalledWith('1', 40, 'featured'));
    // Not part of the batched save call:
    expect(apiService.updateTrack).not.toHaveBeenCalled();
  });

  it('removes a collaborator immediately', async () => {
    apiService.getTrackAdminDetail.mockResolvedValue({
      data: { ...mockDetail, collaborators: [{ id: 5, artist_id: 40, artist_name: 'Collab Artist', role: 'featured', order: 1 }] },
    });
    apiService.removeTrackCollaborator.mockResolvedValue({ data: { success: true } });
    renderPage();
    await screen.findByText('Collab Artist');
    fireEvent.click(screen.getByText('Remove'));
    await waitFor(() => expect(apiService.removeTrackCollaborator).toHaveBeenCalledWith('1', 5));
  });

  it('warns via confirm and saves before navigating when "Back to Album" is clicked with unsaved changes', async () => {
    apiService.updateTrack.mockResolvedValue({ data: { ...mockDetail.track, title: 'Edited Title' } });
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true);
    renderPage();
    const titleInput = await screen.findByDisplayValue('Test Track');
    fireEvent.change(titleInput, { target: { value: 'Edited Title' } });

    fireEvent.click(screen.getByText('← Back to Album'));

    expect(confirmSpy).toHaveBeenCalledWith('You have unsaved changes. Click OK to save and leave, or Cancel to stay on this page.');
    await waitFor(() => expect(apiService.updateTrack).toHaveBeenCalledWith('1', expect.objectContaining({ title: 'Edited Title' })));
    await waitFor(() => expect(screen.getByText('Album Page 10')).toBeInTheDocument());
    confirmSpy.mockRestore();
  });

  it('stays on the page and does not save when "Back to Album" confirm is cancelled', async () => {
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(false);
    renderPage();
    const titleInput = await screen.findByDisplayValue('Test Track');
    fireEvent.change(titleInput, { target: { value: 'Edited Title' } });

    fireEvent.click(screen.getByText('← Back to Album'));

    expect(confirmSpy).toHaveBeenCalled();
    expect(apiService.updateTrack).not.toHaveBeenCalled();
    expect(screen.getByDisplayValue('Edited Title')).toBeInTheDocument();
    confirmSpy.mockRestore();
  });

  it('navigates without confirming when "Back to Album" is clicked with no unsaved changes', async () => {
    const confirmSpy = vi.spyOn(window, 'confirm');
    renderPage();
    await screen.findByDisplayValue('Test Track');

    fireEvent.click(screen.getByText('← Back to Album'));

    expect(confirmSpy).not.toHaveBeenCalled();
    expect(apiService.updateTrack).not.toHaveBeenCalled();
    await waitFor(() => expect(screen.getByText('Album Page 10')).toBeInTheDocument());
    confirmSpy.mockRestore();
  });

  it('opens the MusicBrainz link in an in-app modal instead of navigating', async () => {
    renderPage();
    const link = await screen.findByText('View album on MusicBrainz ↗');

    expect(screen.queryByTitle('MusicBrainz')).not.toBeInTheDocument();

    fireEvent.click(link);

    expect(screen.getByTitle('MusicBrainz')).toHaveAttribute(
      'src',
      'https://musicbrainz.org/release/release-uuid-1'
    );

    fireEvent.click(screen.getByRole('button', { name: 'Close' }));
    expect(screen.queryByTitle('MusicBrainz')).not.toBeInTheDocument();
  });

  it('lets a modified click on the MusicBrainz link open a real new tab', async () => {
    renderPage();
    const link = await screen.findByText('View album on MusicBrainz ↗');

    fireEvent.click(link, { ctrlKey: true });

    expect(screen.queryByTitle('MusicBrainz')).not.toBeInTheDocument();
  });

  it('disables "Fill from MusicBrainz" when no recording MBID is set', async () => {
    renderPage();
    await screen.findByDisplayValue('Test Track');
    expect(screen.getByRole('button', { name: /Fill title\/track # from MusicBrainz/ })).toBeDisabled();
  });

  it('fills title and track number from the preview endpoint and leaves saving to the user', async () => {
    apiService.getTrackAdminDetail.mockResolvedValue({
      data: { ...mockDetail, mediaFile: { ...mockDetail.mediaFile, musicbrainz_recording_id: 'recording-uuid-1' } },
    });
    apiService.getTrackMusicbrainzPreview.mockResolvedValue({ data: { title: 'Lush Life', trackNumber: 5 } });
    renderPage();
    await screen.findByDisplayValue('Test Track');

    const fillButton = screen.getByRole('button', { name: /Fill title\/track # from MusicBrainz/ });
    expect(fillButton).not.toBeDisabled();
    fireEvent.click(fillButton);

    await waitFor(() => expect(apiService.getTrackMusicbrainzPreview).toHaveBeenCalledWith('1'));
    expect(await screen.findByDisplayValue('Lush Life')).toBeInTheDocument();
    expect(screen.getByDisplayValue('5')).toBeInTheDocument();
    // Nothing persisted yet — the existing Save flow does that.
    expect(apiService.updateTrack).not.toHaveBeenCalled();
  });

  it('fills only the title when the match had no trustworthy track number, leaving the existing one alone', async () => {
    apiService.getTrackAdminDetail.mockResolvedValue({
      data: { ...mockDetail, mediaFile: { ...mockDetail.mediaFile, musicbrainz_recording_id: 'recording-uuid-1' } },
    });
    apiService.getTrackMusicbrainzPreview.mockResolvedValue({ data: { title: 'Lush Life', trackNumber: null } });
    renderPage();
    await screen.findByDisplayValue('Test Track');

    fireEvent.click(screen.getByRole('button', { name: /Fill title\/track # from MusicBrainz/ }));

    expect(await screen.findByDisplayValue('Lush Life')).toBeInTheDocument();
    expect(screen.getByDisplayValue('3')).toBeInTheDocument(); // mockDetail's original track_number, unchanged
  });

  it('leaves the fields alone when the preview lookup fails', async () => {
    apiService.getTrackAdminDetail.mockResolvedValue({
      data: { ...mockDetail, mediaFile: { ...mockDetail.mediaFile, musicbrainz_recording_id: 'recording-uuid-1' } },
    });
    apiService.getTrackMusicbrainzPreview.mockRejectedValue({ response: { data: { error: 'Not found in the local MusicBrainz mirror' } } });
    renderPage();
    await screen.findByDisplayValue('Test Track');

    fireEvent.click(screen.getByRole('button', { name: /Fill title\/track # from MusicBrainz/ }));

    await waitFor(() => expect(apiService.getTrackMusicbrainzPreview).toHaveBeenCalled());
    expect(screen.getByDisplayValue('Test Track')).toBeInTheDocument();
  });
});

describe('AdminTrack — unsavedChangesStore registration', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    apiService.getTrackAdminDetail.mockResolvedValue({ data: mockDetail });
  });

  it('registers unsaved changes when a field is edited, clears on unmount', async () => {
    const { unmount } = renderPage();
    const titleInput = await screen.findByDisplayValue('Test Track');

    expect(useUnsavedChangesStore.getState().hasUnsavedChanges).toBe(false);

    fireEvent.change(titleInput, { target: { value: 'New Title' } });
    await waitFor(() => expect(useUnsavedChangesStore.getState().hasUnsavedChanges).toBe(true));
    expect(useUnsavedChangesStore.getState().save).toBeInstanceOf(Function);

    unmount();
    expect(useUnsavedChangesStore.getState().hasUnsavedChanges).toBe(false);
    expect(useUnsavedChangesStore.getState().save).toBe(null);
  });

  it('the registered save function persists the edited fields', async () => {
    apiService.updateTrack.mockResolvedValue({ data: { ...mockDetail.track, title: 'New Title' } });
    renderPage();
    const titleInput = await screen.findByDisplayValue('Test Track');

    fireEvent.change(titleInput, { target: { value: 'New Title' } });
    await waitFor(() => expect(useUnsavedChangesStore.getState().hasUnsavedChanges).toBe(true));

    await useUnsavedChangesStore.getState().save();

    expect(apiService.updateTrack).toHaveBeenCalledWith('1', expect.objectContaining({ title: 'New Title' }));
  });
});

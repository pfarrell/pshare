// src/pages/admin/album/AlbumTransferSection.jsx
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import { apiService } from '../../../services/api';
import { formatCount } from '../../../utils/formatters';
import { getErrorMessage } from '../../../utils/errors';
import { useEntitySearch } from '../../../hooks/useEntitySearch';
import AdminPanel from '../../../components/admin/AdminPanel';
import EntitySearchPicker from '../../../components/admin/EntitySearchPicker';

// Move this album (and its tracks) to another artist, or merge its tracks
// into another album and delete this one.
const AlbumTransferSection = ({ albumId, album, onError }) => {
  const navigate = useNavigate();
  const [transferMode, setTransferMode] = useState('move'); // 'move' | 'merge'
  const [targetArtistId, setTargetArtistId] = useState('');
  const [selectedArtistName, setSelectedArtistName] = useState('');
  const [movingToArtist, setMovingToArtist] = useState(false);
  const [mergeDestAlbum, setMergeDestAlbum] = useState(null);
  const [mergeOffset, setMergeOffset] = useState('');
  const [mergingAlbum, setMergingAlbum] = useState(false);
  const transferSearch = useEntitySearch(transferMode === 'move' ? 'artist-admin' : 'album', {
    filterResults: (rows) => {
      if (transferMode === 'move') return rows;
      const currentArtistId = album?.artist_id;
      const sameArtist = (a) => a.artist_id === currentArtistId || a.artist?.id === currentArtistId;
      return rows
        .filter((a) => String(a.id) !== String(albumId))
        .sort((a, b) => (sameArtist(a) === sameArtist(b) ? 0 : sameArtist(a) ? -1 : 1));
    },
  });

  const handleTransferModeChange = (mode) => {
    setTransferMode(mode);
    transferSearch.reset();
    setTargetArtistId('');
    setSelectedArtistName('');
    setMergeDestAlbum(null);
    setMergeOffset('');
  };

  const handleSelect = (item) => {
    transferSearch.reset();
    if (transferMode === 'move') {
      setTargetArtistId(String(item.id));
      setSelectedArtistName(item.name);
    } else {
      setMergeDestAlbum(item);
      setMergeOffset(String(item.track_count ? parseInt(item.track_count) : 0));
    }
  };

  const handleMoveToArtist = async () => {
    if (!targetArtistId) {
      onError('Target Artist ID is required');
      return;
    }
    const target = selectedArtistName || `artist ID ${targetArtistId}`;
    const confirmed = window.confirm(
      album?.is_compilation
        ? `Move "${album?.title}" to ${target}?\n\nThis is a compilation — its tracks keep their own individual artist credits and will NOT be changed. Only the album's own artist will move. This cannot be undone.`
        : `Move "${album?.title}" and ALL its tracks to ${target}?\n\nThis will update the album and all tracks to belong to the new artist. This cannot be undone.`
    );
    if (!confirmed) return;

    setMovingToArtist(true);
    onError(null);
    try {
      const response = await apiService.moveAlbumToArtist(albumId, targetArtistId);
      const { tracks_moved, is_compilation } = response.data;
      toast.success(
        is_compilation
          ? `Moved album to ${selectedArtistName}. Track credits were left unchanged (compilation).`
          : `Moved album and ${tracks_moved} track(s) to ${selectedArtistName}.`
      );
      navigate(`/album/${albumId}`);
    } catch (error) {
      console.error('Error moving album:', error);
      onError(getErrorMessage(error, 'Failed to move album'));
    } finally {
      setMovingToArtist(false);
    }
  };

  const handleMergeAlbum = async () => {
    if (!mergeDestAlbum) return;
    const offset = parseInt(mergeOffset) || 0;
    const confirmed = window.confirm(
      `Merge "${album?.title}" into "${mergeDestAlbum.title}"?\n\n` +
      (offset > 0 ? `Track numbers will be incremented by ${offset}.\n\n` : 'Track numbers will not be changed.\n\n') +
      'This album will be deleted after the merge. This cannot be undone.'
    );
    if (!confirmed) return;
    setMergingAlbum(true);
    try {
      const response = await apiService.mergeAlbum(albumId, mergeDestAlbum.id, offset);
      toast.success(`Merged ${response.data.tracks_moved} track(s) into "${mergeDestAlbum.title}".`);
      navigate(`/admin/album/${mergeDestAlbum.id}`);
    } catch (error) {
      alert(getErrorMessage(error, 'Failed to merge album'));
    } finally {
      setMergingAlbum(false);
    }
  };

  const actionDisabled = transferMode === 'move' ? (movingToArtist || !targetArtistId) : (mergingAlbum || !mergeDestAlbum);

  return (
    <AdminPanel tone="warning" title="Transfer Album">
      <div style={{ marginBottom: '1rem' }}>
        <select
          value={transferMode}
          onChange={(e) => handleTransferModeChange(e.target.value)}
          style={{ padding: '0.5rem', fontSize: '1rem', border: '1px solid var(--color-warning-border)', borderRadius: '4px', backgroundColor: 'var(--color-bg-surface)', color: 'var(--color-warning-text)', cursor: 'pointer' }}
        >
          <option value="move">Move to another artist</option>
          <option value="merge">Merge into another album</option>
        </select>
      </div>

      <p style={{ marginBottom: '0.75rem', color: 'var(--color-warning-text)', fontSize: '0.875rem' }}>
        {transferMode === 'move'
          ? 'Moves this album and all its tracks to another artist.'
          : 'Moves all tracks into another album, then deletes this album. Use for consolidating multi-disc albums.'}
      </p>

      <EntitySearchPicker
        search={transferSearch}
        tone="warning"
        submitClassName="btn btn-muted"
        maxHeight="200px"
        placeholder={transferMode === 'move' ? 'Search for artist...' : 'Search for destination album...'}
        renderItem={(item) => {
          const isCurrent = transferMode === 'move' ? item.id === album?.artist_id : String(item.id) === String(albumId);
          return (
            <span>
              {item.name || item.title}
              {isCurrent && <span style={{ color: 'var(--color-warning-text-muted)', fontStyle: 'italic' }}> (current)</span>}
            </span>
          );
        }}
        renderAction={(item) => (
          <span style={{ fontSize: '0.8rem', color: 'var(--color-warning-text-muted)' }}>
            {transferMode === 'move'
              ? (item.album_count != null ? formatCount(Number(item.album_count), 'album') : '')
              : `${item.artist?.name ?? ''}${item.track_count != null ? ` · ${formatCount(Number(item.track_count), 'track')}` : ''}`}
          </span>
        )}
        pickOnRowClick
        onPick={handleSelect}
      />

      {transferMode === 'move' && selectedArtistName && (
        <p style={{ marginBottom: '0.75rem', fontSize: '0.875rem', color: 'var(--color-warning-text)' }}>
          Selected: <strong>{selectedArtistName}</strong>
        </p>
      )}

      {transferMode === 'merge' && mergeDestAlbum && (
        <div style={{ marginBottom: '0.75rem' }}>
          <p style={{ fontSize: '0.875rem', color: 'var(--color-warning-text)', marginBottom: '0.5rem' }}>
            Destination: <strong>{mergeDestAlbum.title}</strong>
            {mergeDestAlbum.artist?.name && <span> — {mergeDestAlbum.artist.name}</span>}
            {mergeDestAlbum.track_count != null && <span> ({formatCount(Number(mergeDestAlbum.track_count), 'track')})</span>}
          </p>
          <label style={{ display: 'block', fontSize: '0.875rem', color: 'var(--color-warning-text)', marginBottom: '0.25rem' }}>
            Track number offset (0 = no change):
          </label>
          <input
            type="number"
            value={mergeOffset}
            onChange={(e) => setMergeOffset(e.target.value)}
            min="0"
            style={{ width: '100px', padding: '0.4rem', fontSize: '1rem', border: '1px solid var(--color-warning-border)', borderRadius: '4px', backgroundColor: 'var(--color-bg-surface)', color: 'var(--color-text-primary)' }}
          />
        </div>
      )}

      <button
        type="button"
        className="btn btn-warning btn-lg"
        onClick={transferMode === 'move' ? handleMoveToArtist : handleMergeAlbum}
        disabled={actionDisabled}
      >
        {transferMode === 'move'
          ? (movingToArtist ? 'Moving...' : 'Move Album to Artist')
          : (mergingAlbum ? 'Merging...' : 'Merge into Album')}
      </button>
    </AdminPanel>
  );
};

export default AlbumTransferSection;

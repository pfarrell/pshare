// src/pages/AdminPlaylist.jsx
import { useCallback, useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { apiService } from '../services/api';
import { useAuthStore } from '../stores/authStore';
import { useUnsavedChangesGuard } from '../hooks/useUnsavedChangesGuard';
import { useContextMenu } from '../hooks/useContextMenu';
import { useEntitySearch } from '../hooks/useEntitySearch';
import ContextMenu from '../components/ContextMenu';
import EntitySearchPicker from '../components/admin/EntitySearchPicker';

// Its own component (rather than inline JSX in a .map()) because
// useContextMenu is a hook — each row needs its own open/position state.
// Right-click (desktop) / long-press (mobile) opens a menu that moves the
// track to either end of the list in one step, without dragging it there.
// The Delete button is excluded from opening it (shouldIgnore below) since a
// right-click/long-press there is meant for that button, not the row.
const PlaylistTrackRow = ({ track, index, isDragged, onDragStart, onDragOver, onDrop, onDelete, onMoveToEdge }) => {
  const ctxMenu = useContextMenu({ shouldIgnore: (e) => !!e.target.closest('button') });
  const moveTo = (edge) => {
    ctxMenu.close();
    onMoveToEdge(track.id, edge);
  };
  return (
    <div
      draggable
      onDragStart={(e) => onDragStart(e, index)}
      onDragOver={onDragOver}
      onDrop={(e) => onDrop(e, index)}
      style={{
        padding: '1rem',
        borderBottom: '1px solid var(--color-border)',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        cursor: 'move',
        backgroundColor: isDragged ? 'var(--color-bg-surface-muted)' : 'var(--color-bg-surface)'
      }}
      {...ctxMenu.triggerProps}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', flex: 1 }}>
        <span style={{ color: 'var(--color-text-muted)', fontSize: '0.875rem', width: '2rem' }}>
          {index + 1}
        </span>
        <span style={{ fontSize: '1.5rem', color: 'var(--color-text-faint)', cursor: 'move' }}>
          ☰
        </span>
        <div>
          <div style={{ fontWeight: '500' }}>{track.title}</div>
          <div style={{ fontSize: '0.875rem', color: 'var(--color-text-muted)' }}>
            {track.artist?.name} • {track.album?.title}
          </div>
        </div>
      </div>
      <button
        onClick={() => onDelete(track.id)}
        style={{
          padding: '0.5rem 1rem',
          backgroundColor: '#ef4444',
          color: 'white',
          border: 'none',
          borderRadius: '4px',
          cursor: 'pointer',
          fontSize: '0.875rem'
        }}
      >
        Delete
      </button>
      <ContextMenu
        open={ctxMenu.open}
        position={ctxMenu.position}
        openedViaTouch={ctxMenu.openedViaTouch}
        onDismiss={ctxMenu.dismiss}
        onSwallowTouch={ctxMenu.swallowTouch}
        actions={[
          { key: 'top', icon: '⬆', label: 'Send to Top', onClick: () => moveTo('top') },
          { key: 'bottom', icon: '⬇', label: 'Send to Bottom', onClick: () => moveTo('bottom') },
        ]}
        testId="playlist-row-menu-backdrop"
      />
    </div>
  );
};

export default function AdminPlaylist() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { user, isAdmin } = useAuthStore();
  const [playlistData, setPlaylistData] = useState(null);
  const [originalData, setOriginalData] = useState(null);
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const [tracks, setTracks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const trackSearch = useEntitySearch('track', { minLength: 1 });
  const [showSearch, setShowSearch] = useState(false);
  const [draggedIndex, setDraggedIndex] = useState(null);

  // Image download state
  const [imageUrl, setImageUrl] = useState('');
  const [imageName, setImageName] = useState('');
  const [downloadingImage, setDownloadingImage] = useState(false);

  useEffect(() => {
    loadPlaylist();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  useEffect(() => {
    if (loading || !playlistData) return;
    if (!(isAdmin || (user && playlistData.user_id === user.id))) {
      navigate(`/playlist/${id}`, { replace: true });
    }
  }, [loading, playlistData, isAdmin, user, id, navigate]);

  const loadPlaylist = async () => {
    try {
      setLoading(true);
      const response = await apiService.getPlaylist(id);
      setPlaylistData(response.data.playlist);
      setOriginalData(response.data.playlist);
      setTracks(response.data.tracks || []);
    } catch (err) {
      console.error('Failed to load playlist:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleAddTrack = async (track) => {
    try {
      await apiService.addTrackToPlaylist(id, track.id);
      setTracks([...tracks, track]);
      setShowSearch(false);
      trackSearch.reset();
    } catch (err) {
      console.error('Failed to add track:', err);
      alert('Failed to add track');
    }
  };

  const handleDeleteTrack = async (trackId) => {
    if (!confirm('Are you sure you want to remove this track from the playlist?')) return;

    try {
      await apiService.removeTrackFromPlaylist(id, trackId);
      setTracks(tracks.filter(t => t.id !== trackId));
    } catch (err) {
      console.error('Failed to delete track:', err);
      alert('Failed to delete track');
    }
  };

  const handleDragStart = (e, index) => {
    setDraggedIndex(index);
    e.dataTransfer.effectAllowed = 'move';
  };

  const handleDragOver = (e) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
  };

  // Applies a fully-reordered track list optimistically, then persists it —
  // shared by drag-and-drop and the context menu's Send to Top/Bottom actions.
  const persistReorder = async (newTracks) => {
    setTracks(newTracks);
    try {
      const track_orders = newTracks.map((track, index) => ({
        track_id: track.id,
        order: index + 1
      }));
      await apiService.reorderPlaylistTracks(id, track_orders);
    } catch (err) {
      console.error('Failed to reorder tracks:', err);
      alert('Failed to save track order');
      // Reload to get correct order
      loadPlaylist();
    }
  };

  const handleDrop = async (e, dropIndex) => {
    e.preventDefault();

    if (draggedIndex === null || draggedIndex === dropIndex) return;

    const newTracks = [...tracks];
    const [movedTrack] = newTracks.splice(draggedIndex, 1);
    newTracks.splice(dropIndex, 0, movedTrack);

    setDraggedIndex(null);
    await persistReorder(newTracks);
  };

  const moveTrackToEdge = async (trackId, edge) => {
    const fromIndex = tracks.findIndex((t) => t.id === trackId);
    if (fromIndex === -1) return;

    const newTracks = [...tracks];
    const [moved] = newTracks.splice(fromIndex, 1);
    if (edge === 'top') {
      newTracks.unshift(moved);
    } else {
      newTracks.push(moved);
    }
    await persistReorder(newTracks);
  };

  // Track changes to the editable fields
  useEffect(() => {
    if (!playlistData || !originalData) return;
    const hasChanges =
      playlistData.name !== originalData.name ||
      playlistData.image_path !== originalData.image_path;
    setHasUnsavedChanges(hasChanges);
  }, [playlistData, originalData]);

  // Just the API call, no navigation — shared by the Save button, the
  // link-click guard below, and the pull-to-refresh save prompt in Layout
  // (registered via unsavedChangesStore).
  const savePlaylist = useCallback(async () => {
    await apiService.updatePlaylist(id, {
      name: playlistData.name,
      image_path: playlistData.image_path
    });
    setOriginalData(playlistData);
    setHasUnsavedChanges(false);
  }, [id, playlistData]);

  useUnsavedChangesGuard({
    isDirty: hasUnsavedChanges,
    save: savePlaylist,
    onSaveError: (err) => {
      console.error('Failed to save playlist:', err);
      alert('Failed to save playlist');
    },
  });

  const handleSave = async () => {
    try {
      setSaving(true);
      await savePlaylist();
      navigate(`/playlist/${id}`);
    } catch (err) {
      console.error('Failed to save playlist:', err);
      alert('Failed to save playlist');
    } finally {
      setSaving(false);
    }
  };

  const handleDownloadImage = async (e) => {
    e.preventDefault();
    if (!imageUrl || !imageName) {
      alert('Both Image URL and Image Name are required');
      return;
    }

    setDownloadingImage(true);

    try {
      await apiService.downloadPlaylistImage(id, imageUrl, imageName);

      // Update the image path in the form with the newly downloaded image
      setPlaylistData(prev => ({ ...prev, image_path: imageName }));
      setImageUrl('');
      setImageName('');

      // Refresh playlist data to get updated image_path from server
      await loadPlaylist();
    } catch (error) {
      console.error('Error downloading image:', error);
      alert(error.response?.data?.error || 'Failed to download image');
    } finally {
      setDownloadingImage(false);
    }
  };

  const canEdit = isAdmin || (user && playlistData?.user_id === user.id);

  if (loading) return <div style={{ padding: '2rem' }}>Loading...</div>;
  if (!canEdit) return null;

  return (
    <div style={{ padding: '2rem', backgroundColor: 'var(--color-bg-surface-muted)', minHeight: '100%' }}>
      <div style={{ marginBottom: '2rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h1 style={{ fontSize: '2rem', fontWeight: 'bold', color: 'var(--color-text-primary)' }}>
          Edit Playlist
        </h1>
        <div style={{ display: 'flex', gap: '1rem' }}>
          <button
            onClick={() => navigate(`/playlist/${id}`)}
            style={{
              padding: '0.5rem 1rem',
              backgroundColor: 'var(--color-text-muted)',
              color: 'white',
              border: 'none',
              borderRadius: '4px',
              cursor: 'pointer',
            }}
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            style={{
              padding: '0.5rem 1rem',
              backgroundColor: '#3b82f6',
              color: 'white',
              border: 'none',
              borderRadius: '4px',
              cursor: saving ? 'not-allowed' : 'pointer',
              opacity: saving ? 0.5 : 1
            }}
          >
            {saving ? 'Saving...' : 'Save'}
          </button>
        </div>
      </div>

      {/* Playlist Metadata */}
      <div style={{
        backgroundColor: 'var(--color-bg-surface)',
        padding: '1.5rem',
        borderRadius: '0.5rem',
        marginBottom: '2rem',
        boxShadow: '0 1px 3px 0 rgba(0, 0, 0, 0.1)'
      }}>
        <div style={{ marginBottom: '1rem' }}>
          <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: '500' }}>
            Playlist Name
          </label>
          <input
            type="text"
            value={playlistData?.name || ''}
            onChange={(e) => setPlaylistData({ ...playlistData, name: e.target.value })}
            style={{
              width: '100%',
              padding: '0.5rem',
              border: '1px solid var(--color-border-strong)',
              borderRadius: '4px',
              fontSize: '1rem'
            }}
          />
        </div>

        {/* Current Image */}
        {playlistData?.image_path && (
          <div style={{ marginBottom: '1rem' }}>
            <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: '500' }}>
              Current Image
            </label>
            <img
              src={apiService.getImageUrl(playlistData.image_path, 'album_small')}
              alt="Playlist cover"
              style={{
                maxWidth: '200px',
                borderRadius: '4px',
                border: '1px solid var(--color-border-strong)'
              }}
            />
          </div>
        )}

        {/* Image Download Section */}
        <div style={{
          marginBottom: '1.5rem',
          padding: '1rem',
          backgroundColor: 'var(--color-bg-surface)',
          borderRadius: '4px',
          border: '1px solid var(--color-border)'
        }}>
          <h3 style={{ fontSize: '1.125rem', fontWeight: 'bold', marginBottom: '1rem' }}>
            Download Image from URL
          </h3>
          <div style={{ marginBottom: '1rem' }}>
            <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: '500' }}>
              Image URL
            </label>
            <input
              type="text"
              value={imageUrl}
              onChange={(e) => setImageUrl(e.target.value)}
              placeholder="https://example.com/image.jpg"
              style={{
                width: '100%',
                padding: '0.5rem',
                fontSize: '1rem',
                border: '1px solid var(--color-border-strong)',
                borderRadius: '4px',
              }}
            />
          </div>
          <div style={{ marginBottom: '1rem' }}>
            <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: '500' }}>
              Save as Filename
            </label>
            <input
              type="text"
              value={imageName}
              onChange={(e) => setImageName(e.target.value)}
              placeholder="playlist_cover.jpg"
              style={{
                width: '100%',
                padding: '0.5rem',
                fontSize: '1rem',
                border: '1px solid var(--color-border-strong)',
                borderRadius: '4px',
              }}
            />
          </div>
          <button
            onClick={handleDownloadImage}
            disabled={downloadingImage || !imageUrl || !imageName}
            style={{
              padding: '0.5rem 1rem',
              backgroundColor: '#10b981',
              color: 'white',
              border: 'none',
              borderRadius: '4px',
              fontSize: '0.875rem',
              cursor: (downloadingImage || !imageUrl || !imageName) ? 'not-allowed' : 'pointer',
              opacity: (downloadingImage || !imageUrl || !imageName) ? 0.6 : 1,
            }}
          >
            {downloadingImage ? 'Downloading...' : 'Download & Save Image'}
          </button>
        </div>
      </div>

      {/* Add Track Button */}
      <div style={{ marginBottom: '1rem' }}>
        <button
          onClick={() => setShowSearch(!showSearch)}
          style={{
            padding: '0.5rem 1rem',
            backgroundColor: '#10b981',
            color: 'white',
            border: 'none',
            borderRadius: '4px',
            cursor: 'pointer',
          }}
        >
          {showSearch ? 'Close Search' : '+ Add Track'}
        </button>
      </div>

      {/* Track Search Modal */}
      {showSearch && (
        <div style={{
          backgroundColor: 'var(--color-bg-surface)',
          padding: '1.5rem',
          borderRadius: '0.5rem',
          marginBottom: '2rem',
          boxShadow: '0 1px 3px 0 rgba(0, 0, 0, 0.1)'
        }}>
          <EntitySearchPicker
            search={trackSearch}
            placeholder="Search for tracks..."
            maxHeight="300px"
            renderItem={(track) => (
              <>
                <div style={{ fontWeight: '500' }}>{track.title}</div>
                <div style={{ fontSize: '0.875rem', color: 'var(--color-text-muted)' }}>
                  {track.artist?.name} • {track.album?.title}
                </div>
              </>
            )}
            renderAction={() => <button type="button" className="btn btn-success btn-sm">Add</button>}
            pickOnRowClick
            onPick={handleAddTrack}
          />
        </div>
      )}

      {/* Tracks List */}
      <div style={{
        backgroundColor: 'var(--color-bg-surface)',
        borderRadius: '0.5rem',
        boxShadow: '0 1px 3px 0 rgba(0, 0, 0, 0.1)',
        overflow: 'hidden'
      }}>
        <div style={{ padding: '1rem', borderBottom: '1px solid var(--color-border)', fontWeight: '600' }}>
          Tracks ({tracks.length})
        </div>

        {tracks.length === 0 ? (
          <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--color-text-muted)' }}>
            No tracks in this playlist. Use the search above to add tracks.
          </div>
        ) : (
          tracks.map((track, index) => (
            <PlaylistTrackRow
              key={track.id}
              track={track}
              index={index}
              isDragged={draggedIndex === index}
              onDragStart={handleDragStart}
              onDragOver={handleDragOver}
              onDrop={handleDrop}
              onDelete={handleDeleteTrack}
              onMoveToEdge={moveTrackToEdge}
            />
          ))
        )}
      </div>
    </div>
  );
}

// src/pages/admin/album/AlbumTracksTable.jsx
import { useState } from 'react';
import { apiService } from '../../../services/api';
import { formatDuration } from '../../../utils/formatters';
import TrackArtistPicker from '../../../components/TrackArtistPicker';

const cellStyle = { padding: '0.75rem' };
const headStyle = { padding: '0.75rem', textAlign: 'left', fontWeight: 'bold' };
const inputStyle = { padding: '0.25rem 0.5rem', border: '1px solid var(--color-border-strong)', borderRadius: '4px' };

// Inline-editable track list: each field saves on blur if it changed.
const AlbumTracksTable = ({ tracks, setTracks, isSinglesAlbum }) => {
  const [trackChanges, setTrackChanges] = useState({});

  const handleTrackFieldChange = (trackId, field, value) => {
    setTrackChanges((prev) => ({ ...prev, [trackId]: { ...prev[trackId], [field]: value, dirty: true } }));
  };

  const handleTrackBlur = async (trackId) => {
    const changes = trackChanges[trackId];
    if (!changes || !changes.dirty) return;
    try {
      const { dirty: _dirty, ...updateData } = changes;
      await apiService.updateTrack(trackId, updateData);
      setTracks((prev) => prev.map((t) => (t.id === trackId ? { ...t, ...updateData } : t)));
      setTrackChanges((prev) => {
        const next = { ...prev };
        delete next[trackId];
        return next;
      });
    } catch (error) {
      console.error('Error updating track:', error);
      alert('Failed to update track: ' + (error.response?.data?.error || error.message));
    }
  };

  const handleTrackArtistSelect = async (trackId, newArtistId, newArtistName) => {
    try {
      await apiService.updateTrack(trackId, { artist_id: newArtistId });
      setTracks((prev) => prev.map((t) => (t.id === trackId ? { ...t, artist: { id: newArtistId, name: newArtistName } } : t)));
    } catch (error) {
      console.error('Error updating track artist:', error);
      alert('Failed to update track artist: ' + (error.response?.data?.error || error.message));
    }
  };

  const handleDeleteTrack = async (trackId) => {
    if (!window.confirm('Are you sure you want to delete this track?')) return;
    try {
      await apiService.deleteTrack(trackId);
      setTracks((prev) => prev.filter((t) => t.id !== trackId));
    } catch (error) {
      console.error('Error deleting track:', error);
      alert('Failed to delete track: ' + (error.response?.data?.error || error.message));
    }
  };

  const handleMakeSingle = async (track) => {
    if (!window.confirm(`Remove "${track.title}" from this album and register it as a single for ${track.artist?.name || 'this artist'}?`)) return;
    try {
      await apiService.makeTrackSingle(track.id);
      setTracks((prev) => prev.filter((t) => t.id !== track.id));
    } catch (error) {
      console.error('Error making track a single:', error);
      alert('Failed to make track a single: ' + (error.response?.data?.error || error.message));
    }
  };

  // Save on blur only when the field actually changed since focus.
  const editableProps = (track, field, parse = (v) => v) => ({
    onFocus: (e) => { e.target.dataset.originalValue = e.target.value; },
    onChange: (e) => handleTrackFieldChange(track.id, field, parse(e.target.value)),
    onBlur: (e) => { if (e.target.value !== e.target.dataset.originalValue) handleTrackBlur(track.id); },
  });

  if (!tracks?.length) return null;

  const sorted = [...tracks].sort((a, b) => (parseInt(a.track_number) || 0) - (parseInt(b.track_number) || 0));

  return (
    <div style={{ marginTop: '2rem' }}>
      <h2 style={{ fontSize: '1.5rem', fontWeight: 'bold', marginBottom: '1rem' }}>Individual Tracks</h2>
      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.875rem' }}>
          <thead>
            <tr style={{ backgroundColor: 'var(--color-bg-surface-muted)', borderBottom: '2px solid var(--color-border)' }}>
              <th style={headStyle}>Track #</th>
              <th style={headStyle}>Title</th>
              <th style={headStyle}>Album ID</th>
              <th style={headStyle}>Artist</th>
              <th style={headStyle}>Duration</th>
              <th style={{ ...headStyle, textAlign: 'center' }}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {sorted.map((track) => (
              <tr key={track.id} style={{ borderBottom: '1px solid var(--color-border)' }}>
                <td style={cellStyle}>
                  <input type="text" defaultValue={track.track_number || ''} {...editableProps(track, 'track_number')} style={{ ...inputStyle, width: '60px' }} />
                </td>
                <td style={cellStyle}>
                  <input type="text" defaultValue={track.title || ''} {...editableProps(track, 'title')} style={{ ...inputStyle, width: '100%', minWidth: '200px' }} />
                </td>
                <td style={cellStyle}>
                  <input type="number" defaultValue={track.album?.id || ''} {...editableProps(track, 'album_id', (v) => parseInt(v))} style={{ ...inputStyle, width: '80px' }} />
                </td>
                <td style={cellStyle}>
                  <TrackArtistPicker
                    artistName={track.artist?.name}
                    onSelect={(newArtistId, newArtistName) => handleTrackArtistSelect(track.id, newArtistId, newArtistName)}
                  />
                </td>
                <td style={{ ...cellStyle, color: 'var(--color-text-muted)' }}>{formatDuration(track.duration) || '-'}</td>
                <td style={{ ...cellStyle, textAlign: 'center' }}>
                  {!isSinglesAlbum && (
                    <button type="button" className="btn btn-muted btn-sm" onClick={() => handleMakeSingle(track)} style={{ marginRight: '0.5rem' }}>
                      Make Single
                    </button>
                  )}
                  <button type="button" className="btn btn-danger btn-sm" onClick={() => handleDeleteTrack(track.id)}>Delete</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default AlbumTracksTable;

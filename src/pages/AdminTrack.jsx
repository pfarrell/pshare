// src/pages/AdminTrack.jsx
import { useCallback, useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { apiService } from '../services/api';
import { useUnsavedChangesStore } from '../stores/unsavedChangesStore';
import Loading from '../components/Loading';
import TrackArtistPicker from '../components/TrackArtistPicker';
import MusicBrainzPicker from '../components/MusicBrainzPicker';
import MusicBrainzModal from '../components/MusicBrainzModal';
import { formatDuration } from '../utils/formatters';
import toast from 'react-hot-toast';

const AdminTrack = () => {
  const { id } = useParams();
  const navigate = useNavigate();

  const [detail, setDetail] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [saving, setSaving] = useState(false);

  // Editable form state
  const [title, setTitle] = useState('');
  const [trackNumber, setTrackNumber] = useState('');
  const [releaseYear, setReleaseYear] = useState('');
  const [wikipedia, setWikipedia] = useState('');
  const [albumId, setAlbumId] = useState('');
  const [artistId, setArtistId] = useState(null);
  const [artistName, setArtistName] = useState('');
  const [recordingMbid, setRecordingMbid] = useState('');
  const [mbidStatus, setMbidStatus] = useState('');

  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const [showMusicBrainz, setShowMusicBrainz] = useState(false);

  const [collaborators, setCollaborators] = useState([]);
  const [addingCollaborator, setAddingCollaborator] = useState(false);
  const [newCollaboratorRole, setNewCollaboratorRole] = useState('featured');

  useEffect(() => {
    const fetchDetail = async () => {
      try {
        setLoading(true);
        const response = await apiService.getTrackAdminDetail(id);
        const data = response.data;
        setDetail(data);
        setCollaborators(data.collaborators || []);
        setTitle(data.track.title || '');
        setTrackNumber(data.track.track_number || '');
        setReleaseYear(data.track.release_year || '');
        setWikipedia(data.track.wikipedia || '');
        setAlbumId(data.track.album_id ?? '');
        setArtistId(data.track.artist_id ?? null);
        setArtistName(data.artist?.name || '');
        setRecordingMbid(data.mediaFile?.musicbrainz_recording_id || '');
        setMbidStatus(data.mediaFile?.mbid_status || '');
      } catch (err) {
        console.error('Error fetching track data:', err);
        setError('Failed to load track');
      } finally {
        setLoading(false);
      }
    };
    if (id) fetchDetail();
  }, [id]);

  useEffect(() => {
    if (!detail) return;
    const hasChanges =
      title !== (detail.track.title || '') ||
      trackNumber !== (detail.track.track_number || '') ||
      releaseYear !== (detail.track.release_year || '') ||
      wikipedia !== (detail.track.wikipedia || '') ||
      String(albumId) !== String(detail.track.album_id ?? '') ||
      artistId !== (detail.track.artist_id ?? null) ||
      recordingMbid !== (detail.mediaFile?.musicbrainz_recording_id || '');
    setHasUnsavedChanges(hasChanges);
  }, [title, trackNumber, releaseYear, wikipedia, albumId, artistId, recordingMbid, detail]);

  useEffect(() => {
    const handleBeforeUnload = (e) => {
      if (hasUnsavedChanges) {
        e.preventDefault();
        e.returnValue = '';
      }
    };
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [hasUnsavedChanges]);

  const saveTrack = useCallback(async () => {
    await apiService.updateTrack(id, {
      title,
      track_number: trackNumber,
      album_id: albumId === '' ? null : parseInt(albumId),
      artist_id: artistId,
      release_year: releaseYear,
      wikipedia,
    });
    if (recordingMbid !== (detail.mediaFile?.musicbrainz_recording_id || '')) {
      await apiService.updateTrackRecordingMbid(id, recordingMbid || null);
    }
    setHasUnsavedChanges(false);
  }, [id, title, trackNumber, albumId, artistId, releaseYear, wikipedia, recordingMbid, detail]);

  useEffect(() => {
    const handleClick = async (e) => {
      if (!hasUnsavedChanges) return;
      const link = e.target.closest('a');
      if (!link) return;
      const href = link.getAttribute('href');
      if (!href || href.startsWith('http') || href.startsWith('#')) return;
      if (link.classList.contains('admin-back-link')) return;

      e.preventDefault();
      e.stopPropagation();

      const choice = window.confirm('You have unsaved changes. Click OK to save and leave, or Cancel to stay on this page.');
      if (choice) {
        try {
          await saveTrack();
          setTimeout(() => navigate(href), 0);
        } catch (err) {
          console.error('Error saving track:', err);
          setError(err.response?.data?.error || 'Failed to save track');
        }
      }
    };
    document.addEventListener('click', handleClick, true);
    return () => document.removeEventListener('click', handleClick, true);
  }, [hasUnsavedChanges, saveTrack, navigate]);

  // Registered so Layout's pull-to-refresh can prompt to save before
  // remounting this page (see stores/unsavedChangesStore).
  useEffect(() => {
    useUnsavedChangesStore.getState().setUnsavedChanges(hasUnsavedChanges, saveTrack);
    return () => useUnsavedChangesStore.getState().clear();
  }, [hasUnsavedChanges, saveTrack]);

  const handleNavigateAway = async (destination) => {
    if (hasUnsavedChanges) {
      const choice = window.confirm('You have unsaved changes. Click OK to save and leave, or Cancel to stay on this page.');

      if (choice) {
        // User clicked OK - save and navigate
        try {
          await saveTrack();
          navigate(destination);
        } catch (err) {
          console.error('Error saving track:', err);
          setError(err.response?.data?.error || 'Failed to save track');
        }
      }
      // If Cancel, do nothing (stay on page)
    } else {
      // No unsaved changes, just navigate
      navigate(destination);
    }
  };

  const handleNavigateBack = (e) => {
    e.preventDefault();
    handleNavigateAway(`/album/${detail.track.album_id}`);
  };

  const handleAddCollaborator = async (newArtistId, newArtistName) => {
    try {
      const response = await apiService.addTrackCollaborator(id, newArtistId, newCollaboratorRole);
      setCollaborators((prev) => [...prev, { ...response.data, artist_name: newArtistName }]);
      setAddingCollaborator(false);
      toast.success(`Added "${newArtistName}" as ${newCollaboratorRole}`);
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to add collaborator');
    }
  };

  const handleRemoveCollaborator = async (collaboratorId) => {
    try {
      await apiService.removeTrackCollaborator(id, collaboratorId);
      setCollaborators((prev) => prev.filter((c) => c.id !== collaboratorId));
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to remove collaborator');
    }
  };

  const handleSave = async (e) => {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      await saveTrack();
      toast.success('Track saved');
      navigate(`/album/${albumId}`);
    } catch (err) {
      console.error('Error saving track:', err);
      setError(err.response?.data?.error || 'Failed to save track');
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <Loading />;
  if (error && !detail) return <div style={{ padding: '2rem', color: '#dc2626' }}>{error}</div>;
  if (!detail) return null;

  return (
    <div style={{ padding: '2rem', maxWidth: '800px', margin: '0 auto' }}>
      <a href={`/album/${detail.track.album_id}`} className="admin-back-link" onClick={handleNavigateBack}>
        ← Back to Album
      </a>

      <h1 style={{ fontSize: '1.75rem', fontWeight: 'bold', margin: '1rem 0' }}>Edit Track</h1>

      {error && <div style={{ color: '#dc2626', marginBottom: '1rem' }}>{error}</div>}

      <form onSubmit={handleSave}>
        <div style={{ marginBottom: '1rem' }}>
          <label style={{ display: 'block', fontWeight: 'bold', marginBottom: '0.25rem' }}>Title</label>
          <input type="text" value={title} onChange={(e) => setTitle(e.target.value)} style={{ width: '100%', padding: '0.5rem', border: '1px solid var(--color-border-strong)', borderRadius: '4px' }} />
        </div>

        <div style={{ marginBottom: '1rem' }}>
          <label style={{ display: 'block', fontWeight: 'bold', marginBottom: '0.25rem' }}>Track Number</label>
          <input type="text" value={trackNumber} onChange={(e) => setTrackNumber(e.target.value)} style={{ width: '100px', padding: '0.5rem', border: '1px solid var(--color-border-strong)', borderRadius: '4px' }} />
        </div>

        <div style={{ marginBottom: '1rem' }}>
          <label style={{ display: 'block', fontWeight: 'bold', marginBottom: '0.25rem' }}>Release Year</label>
          <input type="text" value={releaseYear} onChange={(e) => setReleaseYear(e.target.value)} style={{ width: '100px', padding: '0.5rem', border: '1px solid var(--color-border-strong)', borderRadius: '4px' }} />
        </div>

        <div style={{ marginBottom: '1rem' }}>
          <label style={{ display: 'block', fontWeight: 'bold', marginBottom: '0.25rem' }}>Album ID</label>
          <input type="number" value={albumId} onChange={(e) => setAlbumId(e.target.value)} style={{ width: '100px', padding: '0.5rem', border: '1px solid var(--color-border-strong)', borderRadius: '4px' }} />
          {detail.album?.musicbrainz_id && (
            <a
              href={`https://musicbrainz.org/release/${detail.album.musicbrainz_id}`}
              onClick={(e) => {
                // A modified click (ctrl/cmd/shift, middle-click) is the
                // user asking for a real new tab — let the browser do that.
                if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
                e.preventDefault();
                setShowMusicBrainz(true);
              }}
              rel="noopener noreferrer"
              style={{ marginLeft: '0.75rem', fontSize: '0.875rem', color: '#3b82f6' }}
            >
              View album on MusicBrainz ↗
            </a>
          )}
          {showMusicBrainz && (
            <MusicBrainzModal
              url={`https://musicbrainz.org/release/${detail.album.musicbrainz_id}`}
              onClose={() => setShowMusicBrainz(false)}
            />
          )}
        </div>

        <div style={{ marginBottom: '1rem' }}>
          <label style={{ display: 'block', fontWeight: 'bold', marginBottom: '0.25rem' }}>Primary Artist</label>
          <TrackArtistPicker
            artistName={artistName}
            onSelect={(newArtistId, newArtistName) => { setArtistId(newArtistId); setArtistName(newArtistName); }}
          />
        </div>

        <div style={{ marginBottom: '1rem' }}>
          <label style={{ display: 'block', fontWeight: 'bold', marginBottom: '0.25rem' }}>Collaborators</label>
          {collaborators.map((c) => (
            <div key={c.id} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.25rem' }}>
              <span>{c.artist_name}</span> <span>({c.role})</span>
              <button type="button" onClick={() => handleRemoveCollaborator(c.id)} style={{ fontSize: '0.75rem', padding: '0.15rem 0.5rem', cursor: 'pointer' }}>
                Remove
              </button>
            </div>
          ))}
          {addingCollaborator ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <select value={newCollaboratorRole} onChange={(e) => setNewCollaboratorRole(e.target.value)} style={{ padding: '0.25rem', fontSize: '0.8rem' }}>
                <option value="featured">featured</option>
                <option value="guest">guest</option>
                <option value="collaborator">collaborator</option>
              </select>
              <TrackArtistPicker artistName="" onSelect={handleAddCollaborator} startEditing />
              <button type="button" onClick={() => setAddingCollaborator(false)} style={{ fontSize: '0.75rem', padding: '0.15rem 0.5rem', cursor: 'pointer' }}>
                Cancel
              </button>
            </div>
          ) : (
            <button type="button" onClick={() => setAddingCollaborator(true)} style={{ fontSize: '0.75rem', padding: '0.15rem 0.5rem', cursor: 'pointer' }}>
              Add Collaborator
            </button>
          )}
        </div>

        <div style={{ marginBottom: '1rem' }}>
          <label style={{ display: 'block', fontWeight: 'bold', marginBottom: '0.25rem' }}>Wikipedia</label>
          <textarea value={wikipedia} onChange={(e) => setWikipedia(e.target.value)} rows={4} style={{ width: '100%', padding: '0.5rem', border: '1px solid var(--color-border-strong)', borderRadius: '4px' }} />
        </div>

        <div style={{ marginBottom: '1.5rem' }}>
          <label style={{ display: 'block', fontWeight: 'bold', marginBottom: '0.25rem' }}>Recording MusicBrainz ID</label>
          <MusicBrainzPicker
            entityType="recording"
            value={recordingMbid}
            mbidStatus={mbidStatus}
            searchDefault={title}
            artistName={artistName}
            pending={recordingMbid !== (detail.mediaFile?.musicbrainz_recording_id || '')}
            onChange={setRecordingMbid}
          />
        </div>

        <button type="submit" disabled={saving} style={{ padding: '0.5rem 1.5rem', backgroundColor: '#3b82f6', color: 'white', border: 'none', borderRadius: '4px', fontWeight: 'bold', cursor: saving ? 'not-allowed' : 'pointer' }}>
          {saving ? 'Saving...' : 'Save'}
        </button>
      </form>

      <div style={{ marginTop: '2rem', padding: '1rem', backgroundColor: 'var(--color-bg-surface)', borderRadius: '4px', fontSize: '0.875rem' }}>
        <h2 style={{ fontSize: '1.1rem', fontWeight: 'bold', marginBottom: '0.75rem' }}>File Info (read-only)</h2>
        <div><strong>Track ID:</strong> {detail.track.id}</div>
        <div><strong>Media File ID:</strong> {detail.track.media_file_id ?? '—'}</div>
        <div><strong>Duration:</strong> {formatDuration(detail.track.duration_sec) || '—'}</div>
        <div><strong>Approved:</strong> {String(detail.track.approved)}</div>
        <div><strong>Track Created:</strong> {detail.track.created_at}</div>
        <div><strong>Track Updated:</strong> {detail.track.updated_at}</div>
        {detail.mediaFile && (
          <>
            <div><strong>File Path:</strong> {detail.mediaFile.absolute_path}</div>
            <div><strong>File Name:</strong> {detail.mediaFile.name}</div>
            <div><strong>File Type:</strong> {detail.mediaFile.file_type}</div>
            <div><strong>File Hash:</strong> {detail.mediaFile.file_hash}</div>
            <div><strong>Chromaprint Fingerprint:</strong> {detail.mediaFile.chromaprint_fingerprint ? `${detail.mediaFile.chromaprint_fingerprint.slice(0, 40)}…` : '—'}</div>
            <div><strong>Chromaprint Duration:</strong> {detail.mediaFile.chromaprint_duration_sec ?? '—'}</div>
            <div><strong>Imported:</strong> {detail.mediaFile.imported_date ?? '—'}</div>
            <div><strong>Last Modified:</strong> {detail.mediaFile.last_modified ?? '—'}</div>
            <div><strong>MBID Status:</strong> {detail.mediaFile.mbid_status ?? '—'}</div>
            <div><strong>MBID Confidence:</strong> {detail.mediaFile.mbid_confidence ?? '—'}</div>
          </>
        )}
      </div>
    </div>
  );
};

export default AdminTrack;

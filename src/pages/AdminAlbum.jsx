// src/pages/AdminAlbum.jsx
import { useCallback, useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { apiService } from '../services/api';
import { useUnsavedChangesStore } from '../stores/unsavedChangesStore';
import Loading from '../components/Loading';
import ConfirmDeleteModal from '../components/ConfirmDeleteModal';
import TagsSection from '../components/TagsSection';
import MusicBrainzPicker from '../components/MusicBrainzPicker';
import TrackArtistPicker from '../components/TrackArtistPicker';
import ReprocessAlbumModal from '../components/ReprocessAlbumModal';
import { parseWikipediaSlug } from '../utils/wikipediaSlug';
import { formatDuration } from '../utils/formatters';
import { toFilename } from '../utils/filenames';
import toast from 'react-hot-toast';

const AdminAlbum = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const [albumData, setAlbumData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [saving, setSaving] = useState(false);

  // Form state
  const [title, setTitle] = useState('');
  const [artistId, setArtistId] = useState('');
  const [releaseYear, setReleaseYear] = useState('');
  const [imagePath, setImagePath] = useState('');
  const [wikipedia, setWikipedia] = useState('');
  const [musicbrainzId, setMusicbrainzId] = useState('');
  const [mbidStatus, setMbidStatus] = useState('');
  const [isCompilation, setIsCompilation] = useState(false);

  // Same rationale as AdminUpload's lock: a compilation album must always
  // resolve to the placeholder artist, never something else set by mistake.
  useEffect(() => {
    if (isCompilation) {
      setArtistId('161');
    }
  }, [isCompilation]);

  // Track if form has unsaved changes
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);

  // Image gallery state
  const [images, setImages] = useState([]);
  const [newImageUrl, setNewImageUrl] = useState('');
  const [newImageName, setNewImageName] = useState('');
  const [addingImage, setAddingImage] = useState(false);

  // Tracks state
  const [tracks, setTracks] = useState([]);
  const [trackChanges, setTrackChanges] = useState({});

  // Transfer section (move to artist / merge into album)
  const [transferMode, setTransferMode] = useState('move'); // 'move' | 'merge'
  const [transferQuery, setTransferQuery] = useState('');
  const [transferResults, setTransferResults] = useState([]);
  const [transferSearching, setTransferSearching] = useState(false);
  const [targetArtistId, setTargetArtistId] = useState('');
  const [selectedArtistName, setSelectedArtistName] = useState('');
  const [movingToArtist, setMovingToArtist] = useState(false);
  const [mergeDestAlbum, setMergeDestAlbum] = useState(null);
  const [mergeOffset, setMergeOffset] = useState('');
  const [mergingAlbum, setMergingAlbum] = useState(false);

  // Secondary artists state
  const [secondaryArtists, setSecondaryArtists] = useState([]);
  const [showAddArtistSection, setShowAddArtistSection] = useState(false);
  const [addArtistQuery, setAddArtistQuery] = useState('');
  const [addArtistResults, setAddArtistResults] = useState([]);
  const [addArtistRole, setAddArtistRole] = useState('featured');
  const [addArtistSearching, setAddArtistSearching] = useState(false);

  // Reprocess-from-files modal
  const [showReprocessModal, setShowReprocessModal] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);

  const fetchAlbumData = async () => {
    try {
      setLoading(true);
      const response = await apiService.getAlbum(id);
      const { album, artist, tracks } = response.data;
      setAlbumData({ album, artist });
      setTitle(album.title || '');
      setArtistId(String(album.artist_id) || '');
      setNewImageName(toFilename(artist.name || '') + '-' + toFilename(album.title || '') + '.jpg');
      setReleaseYear(album.release_year || '');
      setImagePath(album.image_path || '');
      setWikipedia(album.wikipedia || '');
      setMusicbrainzId(album.musicbrainz_id || '');
      setMbidStatus(album.mbid_status || '');
      setIsCompilation(!!album.is_compilation);
      setTracks(tracks || []);
      const imagesRes = await apiService.getAlbumImages(id);
      setImages(imagesRes.data);
    } catch (error) {
      console.error('Error fetching album data:', error);
      setError('Failed to load album');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (id) {
      fetchAlbumData();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  useEffect(() => {
    const loadSecondaryArtists = async () => {
      try {
        const response = await apiService.getAlbumSecondaryArtists(id);
        setSecondaryArtists(response.data);
      } catch (error) {
        console.error('Error loading secondary artists:', error);
      }
    };
    if (id) loadSecondaryArtists();
  }, [id]);

  // Track changes to form fields
  useEffect(() => {
    if (!albumData?.album) return;

    const album = albumData.album;
    const hasChanges =
      title !== (album.title || '') ||
      artistId !== String(album.artist_id || '') ||
      releaseYear !== (album.release_year || '') ||
      imagePath !== (album.image_path || '') ||
      wikipedia !== (album.wikipedia || '') ||
      isCompilation !== !!album.is_compilation ||
      musicbrainzId !== (album.musicbrainz_id || '');

    setHasUnsavedChanges(hasChanges);
  }, [title, artistId, releaseYear, imagePath, wikipedia, isCompilation, musicbrainzId, albumData]);

  // Warn user before leaving page with unsaved changes (browser navigation)
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

  // Just the API call, no navigation — shared by the form submit, the
  // link-click guard below, and the pull-to-refresh save prompt in Layout
  // (registered via unsavedChangesStore below).
  const saveAlbum = useCallback(async () => {
    await apiService.updateAlbum(id, {
      title,
      artist_id: parseInt(artistId),
      release_year: releaseYear,
      image_path: imagePath,
      wikipedia,
      is_compilation: isCompilation,
      musicbrainz_id: musicbrainzId,
    });
    setHasUnsavedChanges(false);
  }, [id, title, artistId, releaseYear, imagePath, wikipedia, isCompilation, musicbrainzId]);

  // Intercept all link clicks to check for unsaved changes
  useEffect(() => {
    const handleClick = async (e) => {
      // Only intercept if we have unsaved changes
      if (!hasUnsavedChanges) return;

      // Check if the click is on a link (or inside a link)
      const link = e.target.closest('a');
      if (!link) return;

      // Check if it's an internal navigation link (not the back link we control)
      const href = link.getAttribute('href');
      if (!href || href.startsWith('http') || href.startsWith('#')) return;

      // Don't intercept our own back link
      if (link.classList.contains('admin-back-link')) return;

      // Prevent the default navigation
      e.preventDefault();
      e.stopPropagation();

      // Ask user what to do
      const choice = window.confirm('You have unsaved changes. Click OK to save and leave, or Cancel to stay on this page.');

      if (choice) {
        // User clicked OK - save and navigate
        try {
          await saveAlbum();
          // Navigate to the link destination
          setTimeout(() => navigate(href), 0);
        } catch (error) {
          console.error('Error saving album:', error);
          setError(error.response?.data?.error || 'Failed to save album');
        }
      }
    };

    // Add click listener to the document
    document.addEventListener('click', handleClick, true);
    return () => document.removeEventListener('click', handleClick, true);
  }, [hasUnsavedChanges, saveAlbum, navigate]);

  useEffect(() => {
    useUnsavedChangesStore.getState().setUnsavedChanges(hasUnsavedChanges, saveAlbum);
    return () => useUnsavedChangesStore.getState().clear();
  }, [hasUnsavedChanges, saveAlbum]);

  const handleSave = async (e) => {
    e.preventDefault();
    setSaving(true);
    setError(null);

    try {
      await saveAlbum();

      // Redirect to regular album page after successful save
      navigate(`/album/${id}`);
    } catch (error) {
      console.error('Error updating album:', error);
      setError(error.response?.data?.error || 'Failed to update album');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = () => {
    setShowDeleteModal(true);
  };

  const confirmDelete = async () => {
    await apiService.deleteAlbum(id);
    navigate('/');
  };

  const handleNavigateAway = async (destination) => {
    if (hasUnsavedChanges) {
      const choice = window.confirm('You have unsaved changes. Click OK to save and leave, or Cancel to stay on this page.');

      if (choice) {
        // User clicked OK - save and navigate
        try {
          await apiService.updateAlbum(id, {
            title,
            artist_id: parseInt(artistId),
            release_year: releaseYear,
            image_path: imagePath,
            wikipedia,
            is_compilation: isCompilation,
            musicbrainz_id: musicbrainzId,
          });
          setHasUnsavedChanges(false);
          navigate(destination);
        } catch (error) {
          console.error('Error saving album:', error);
          setError(error.response?.data?.error || 'Failed to save album');
        }
      }
      // If Cancel, do nothing (stay on page)
    } else {
      // No unsaved changes, just navigate
      navigate(destination);
    }
  };

  const handleCancel = () => {
    handleNavigateAway(`/album/${id}`);
  };

  const handleNavigateBack = (e) => {
    e.preventDefault();
    handleNavigateAway(`/album/${id}`);
  };

  // Track editing handlers
  const handleTrackFieldChange = (trackId, field, value) => {
    setTrackChanges(prev => ({
      ...prev,
      [trackId]: {
        ...prev[trackId],
        [field]: value,
        dirty: true
      }
    }));
  };

  const handleTrackBlur = async (trackId) => {
    const changes = trackChanges[trackId];
    if (!changes || !changes.dirty) return;

    try {
      const updateData = {};
      Object.keys(changes).forEach(key => {
        if (key !== 'dirty') {
          updateData[key] = changes[key];
        }
      });

      await apiService.updateTrack(trackId, updateData);

      // Update the track in local state
      setTracks(prevTracks =>
        prevTracks.map(t =>
          t.id === trackId ? { ...t, ...updateData } : t
        )
      );

      // Clear the changes for this track
      setTrackChanges(prev => {
        const newChanges = { ...prev };
        delete newChanges[trackId];
        return newChanges;
      });
    } catch (error) {
      console.error('Error updating track:', error);
      alert('Failed to update track: ' + (error.response?.data?.error || error.message));
    }
  };

  const handleTrackArtistSelect = async (trackId, newArtistId, newArtistName) => {
    try {
      await apiService.updateTrack(trackId, { artist_id: newArtistId });
      setTracks(prevTracks =>
        prevTracks.map(t =>
          t.id === trackId ? { ...t, artist: { id: newArtistId, name: newArtistName } } : t
        )
      );
    } catch (error) {
      console.error('Error updating track artist:', error);
      alert('Failed to update track artist: ' + (error.response?.data?.error || error.message));
    }
  };

  const handleDeleteTrack = async (trackId) => {
    if (!window.confirm('Are you sure you want to delete this track?')) {
      return;
    }

    try {
      await apiService.deleteTrack(trackId);
      setTracks(prevTracks => prevTracks.filter(t => t.id !== trackId));
    } catch (error) {
      console.error('Error deleting track:', error);
      alert('Failed to delete track: ' + (error.response?.data?.error || error.message));
    }
  };

  const handleMakeSingle = async (track) => {
    if (!window.confirm(`Remove "${track.title}" from this album and register it as a single for ${track.artist?.name || 'this artist'}?`)) {
      return;
    }
    try {
      await apiService.makeTrackSingle(track.id);
      setTracks(prevTracks => prevTracks.filter(t => t.id !== track.id));
    } catch (error) {
      console.error('Error making track a single:', error);
      alert('Failed to make track a single: ' + (error.response?.data?.error || error.message));
    }
  };

  const handleTransferModeChange = (mode) => {
    setTransferMode(mode);
    setTransferQuery('');
    setTransferResults([]);
    setTargetArtistId('');
    setSelectedArtistName('');
    setMergeDestAlbum(null);
    setMergeOffset('');
  };

  const handleTransferSearch = async (e) => {
    e.preventDefault();
    if (transferQuery.length < 2) return;
    setTransferSearching(true);
    try {
      if (transferMode === 'move') {
        const response = await apiService.searchAdminArtists(transferQuery);
        setTransferResults(response.data || []);
      } else {
        const response = await apiService.search(transferQuery);
        const currentArtistId = albumData?.album?.artist_id;
        const albumResults = (response.data.results || []).filter(r => r.type === 'album').map(r => r.data);
        const filtered = albumResults.filter(a => String(a.id) !== String(id));
        filtered.sort((a, b) => {
          const aIsSame = a.artist_id === currentArtistId || a.artist?.id === currentArtistId;
          const bIsSame = b.artist_id === currentArtistId || b.artist?.id === currentArtistId;
          if (aIsSame && !bIsSame) return -1;
          if (!aIsSame && bIsSame) return 1;
          return 0;
        });
        setTransferResults(filtered);
      }
    } catch (error) {
      console.error('Transfer search error:', error);
    } finally {
      setTransferSearching(false);
    }
  };

  const handleSelectTransferResult = async (item) => {
    setTransferResults([]);
    setTransferQuery('');
    if (transferMode === 'move') {
      setTargetArtistId(String(item.id));
      setSelectedArtistName(item.name);
    } else {
      setMergeDestAlbum(item);
      const maxTrackNum = item.track_count ? parseInt(item.track_count) : 0;
      setMergeOffset(String(maxTrackNum));
    }
  };

  const handleMergeAlbum = async () => {
    if (!mergeDestAlbum) return;
    const offset = parseInt(mergeOffset) || 0;
    const confirmed = window.confirm(
      `Merge "${albumData?.album?.title}" into "${mergeDestAlbum.title}"?\n\n` +
      (offset > 0 ? `Track numbers will be incremented by ${offset}.\n\n` : 'Track numbers will not be changed.\n\n') +
      `This album will be deleted after the merge. This cannot be undone.`
    );
    if (!confirmed) return;
    setMergingAlbum(true);
    try {
      const response = await apiService.mergeAlbum(id, mergeDestAlbum.id, offset);
      const { tracks_moved } = response.data;
      toast.success(`Merged ${tracks_moved} track(s) into "${mergeDestAlbum.title}".`);
      navigate(`/admin/album/${mergeDestAlbum.id}`);
    } catch (error) {
      alert(error.response?.data?.error || 'Failed to merge album');
    } finally {
      setMergingAlbum(false);
    }
  };

  const handleAddArtistSearch = async (e) => {
    e.preventDefault();
    if (addArtistQuery.length < 2) return;
    setAddArtistSearching(true);
    try {
      const response = await apiService.search(addArtistQuery);
      setAddArtistResults((response.data.results || []).filter(r => r.type === 'artist').map(r => r.data));
    } catch (error) {
      console.error('Search failed:', error);
    } finally {
      setAddArtistSearching(false);
    }
  };

  const handleAddArtistToAlbum = async (artist) => {
    try {
      await apiService.addArtistToAlbum(id, artist.id, addArtistRole);
      const response = await apiService.getAlbumSecondaryArtists(id);
      setSecondaryArtists(response.data);
      setAddArtistResults([]);
      setAddArtistQuery('');
      setShowAddArtistSection(false);
    } catch (error) {
      alert(error.response?.data?.error || 'Failed to add artist');
    }
  };

  const handleRemoveArtistFromAlbum = async (artistId) => {
    if (!window.confirm('Remove this artist from the album?')) return;
    try {
      await apiService.removeArtistFromAlbum(id, artistId);
      setSecondaryArtists(prev => prev.filter(a => a.artist_id !== artistId));
    } catch (error) {
      alert(error.response?.data?.error || 'Failed to remove artist');
    }
  };

  const handleMoveToArtist = async () => {
    if (!targetArtistId) {
      setError('Target Artist ID is required');
      return;
    }

    const isCompilationAlbum = !!albumData?.album?.is_compilation;
    const confirmed = window.confirm(
      isCompilationAlbum
        ? `Move "${albumData?.album?.title}" to ${selectedArtistName || `artist ID ${targetArtistId}`}?\n\nThis is a compilation — its tracks keep their own individual artist credits and will NOT be changed. Only the album's own artist will move. This cannot be undone.`
        : `Move "${albumData?.album?.title}" and ALL its tracks to ${selectedArtistName || `artist ID ${targetArtistId}`}?\n\nThis will update the album and all tracks to belong to the new artist. This cannot be undone.`
    );

    if (!confirmed) return;

    setMovingToArtist(true);
    setError(null);

    try {
      const response = await apiService.moveAlbumToArtist(id, targetArtistId);
      const { tracks_moved, is_compilation } = response.data;
      toast.success(
        is_compilation
          ? `Moved album to ${selectedArtistName}. Track credits were left unchanged (compilation).`
          : `Moved album and ${tracks_moved} track(s) to ${selectedArtistName}.`
      );
      navigate(`/album/${id}`);
    } catch (error) {
      console.error('Error moving album:', error);
      setError(error.response?.data?.error || 'Failed to move album');
    } finally {
      setMovingToArtist(false);
    }
  };

  if (loading) {
    return <Loading message="Loading album" />;
  }

  if (error && !albumData) {
    return (
      <div className="loading-container">
        <p style={{ color: '#ef4444', fontSize: '1.25rem' }}>{error}</p>
        <button onClick={() => navigate('/')}>Go Home</button>
      </div>
    );
  }

  return (
    <div className="admin-page" style={{ padding: '2rem', maxWidth: '800px', margin: '0 auto' }}>
      <div style={{ marginBottom: '1rem' }}>
        <a
          href={`/album/${id}`}
          onClick={handleNavigateBack}
          className="admin-back-link"
          style={{
            color: '#3b82f6',
            textDecoration: 'none',
            fontSize: '0.875rem'
          }}
        >
          ← Back to Album Page
        </a>
      </div>
      <h1 style={{ marginBottom: '2rem', fontSize: '2rem' }}>Edit Album</h1>

      {error && (
        <div style={{
          padding: '1rem',
          marginBottom: '1rem',
          backgroundColor: '#fee',
          color: '#c00',
          borderRadius: '4px'
        }}>
          {error}
        </div>
      )}

      <form onSubmit={handleSave}>
        <div style={{ marginBottom: '1.5rem' }}>
          <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 'bold' }}>
            Title *
          </label>
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            required
            style={{
              width: '100%',
              padding: '0.5rem',
              fontSize: '1rem',
              border: '1px solid var(--color-border)',
              borderRadius: '4px',
            }}
          />
        </div>

        <div style={{ marginBottom: '1.5rem' }}>
          <label htmlFor="album-artist-id" style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 'bold' }}>
            Artist ID *
          </label>
          <input
            id="album-artist-id"
            type="number"
            value={artistId}
            onChange={(e) => setArtistId(e.target.value)}
            required
            disabled={isCompilation}
            style={{
              width: '100%',
              padding: '0.5rem',
              fontSize: '1rem',
              border: '1px solid var(--color-border)',
              borderRadius: '4px',
              backgroundColor: isCompilation ? 'var(--color-bg-surface-muted)' : 'var(--color-bg-surface)',
            }}
          />
          <small style={{ color: 'var(--color-text-muted)', fontSize: '0.875rem' }}>
            Current artist: {albumData?.artist?.name}
          </small>
        </div>

        <div style={{ marginBottom: '1.5rem' }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontWeight: 'bold', cursor: 'pointer' }}>
            <input
              type="checkbox"
              checked={isCompilation}
              onChange={(e) => setIsCompilation(e.target.checked)}
            />
            Is compilation
          </label>
          <small style={{ color: 'var(--color-text-muted)', fontSize: '0.875rem' }}>
            Various-artists album — track artists are shown individually and the "Also featuring" list is hidden.
          </small>
        </div>

        <div style={{ marginBottom: '1.5rem' }}>
          <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 'bold' }}>
            Release Year
          </label>
          <input
            type="text"
            value={releaseYear}
            onChange={(e) => setReleaseYear(e.target.value)}
            placeholder="e.g., 1969"
            style={{
              width: '100%',
              padding: '0.5rem',
              fontSize: '1rem',
              border: '1px solid var(--color-border)',
              borderRadius: '4px',
            }}
          />
        </div>

        <div style={{ marginBottom: '1.5rem' }}>
          <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 'bold' }}>
            Image Path
          </label>
          <input
            type="text"
            value={imagePath}
            onChange={(e) => setImagePath(e.target.value)}
            placeholder="e.g., abbey_road.jpg"
            style={{
              width: '100%',
              padding: '0.5rem',
              fontSize: '1rem',
              border: '1px solid var(--color-border)',
              borderRadius: '4px',
            }}
          />
          {imagePath && (
            <img
              src={apiService.getImageUrl(imagePath, 'album_page')}
              alt="Preview"
              style={{ marginTop: '0.5rem', maxWidth: '200px', borderRadius: '4px' }}
            />
          )}
        </div>

        {/* Image Gallery */}
        <div style={{ marginBottom: '1.5rem', padding: '1rem', backgroundColor: 'var(--color-bg-surface)', borderRadius: '4px', border: '1px solid var(--color-border)' }}>
          <h3 style={{ fontSize: '1.125rem', fontWeight: 'bold', marginBottom: '1rem' }}>Images</h3>

          {images.length > 0 && (
            <div style={{ display: 'flex', flexWrap: 'nowrap', gap: '12px', marginBottom: '16px', overflowX: 'auto', paddingBottom: '8px' }}>
              {images.map(img => (
                <div key={img.id} style={{
                  border: img.is_primary ? '2px solid #4ade80' : '2px solid var(--color-text-secondary)',
                  borderRadius: '8px',
                  padding: '8px',
                  width: '120px',
                }}>
                  <img
                    src={apiService.getImageUrl(img.path, 'album_page')}
                    alt=""
                    style={{ width: '100%', height: '100px', objectFit: 'cover', borderRadius: '4px' }}
                  />
                  <div style={{ fontSize: '11px', color: 'var(--color-text-faint)', marginTop: '4px' }}>{img.source}</div>
                  {img.status === 'proposed' && (
                    <div style={{ fontSize: '11px', color: '#facc15' }}>proposed</div>
                  )}
                  <div style={{ display: 'flex', gap: '4px', marginTop: '6px' }}>
                    {!img.is_primary && (
                      <button
                        type="button"
                        onClick={async () => {
                          await apiService.setAlbumImagePrimary(id, img.id);
                          const res = await apiService.getAlbumImages(id);
                          setImages(res.data);
                          setImagePath(img.path);
                        }}
                        style={{ fontSize: '11px', padding: '2px 6px' }}
                      >
                        Set Primary
                      </button>
                    )}
                    {img.is_primary && (
                      <span style={{ fontSize: '11px', color: '#4ade80' }}>✓ Primary</span>
                    )}
                    <button
                      type="button"
                      onClick={async () => {
                        if (!confirm('Delete this image?')) return;
                        await apiService.deleteAlbumImage(id, img.id);
                        setImages(images.filter(i => i.id !== img.id));
                      }}
                      style={{ fontSize: '11px', padding: '2px 6px', color: '#f87171' }}
                    >
                      Delete
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}

          <div style={{ display: 'flex', gap: '8px', alignItems: 'flex-end', flexWrap: 'wrap' }}>
            <div style={{ flex: '1 1 200px', minWidth: 0 }}>
              <label style={{ display: 'block', marginBottom: '0.25rem', fontWeight: 'bold', fontSize: '0.875rem' }}>Image URL</label>
              <input
                type="text"
                value={newImageUrl}
                onChange={e => setNewImageUrl(e.target.value)}
                placeholder="https://..."
                style={{ width: '100%', boxSizing: 'border-box', padding: '0.5rem', fontSize: '1rem', border: '1px solid var(--color-border)', borderRadius: '4px' }}
              />
            </div>
            <div>
              <label style={{ display: 'block', marginBottom: '0.25rem', fontWeight: 'bold', fontSize: '0.875rem' }}>File name</label>
              <input
                type="text"
                value={newImageName}
                onChange={e => setNewImageName(e.target.value)}
                placeholder="album_123.jpg"
                style={{ padding: '0.5rem', fontSize: '1rem', border: '1px solid var(--color-border)', borderRadius: '4px' }}
              />
            </div>
            <button
              type="button"
              onClick={async () => {
                if (!newImageUrl || !newImageName) return;
                setAddingImage(true);
                try {
                  const setPrimary = images.length === 0;
                  await apiService.addAlbumImage(id, newImageUrl, newImageName, setPrimary);
                  const res = await apiService.getAlbumImages(id);
                  setImages(res.data);
                  if (setPrimary) setImagePath(newImageName);
                  setNewImageUrl('');
                  setNewImageName(toFilename(albumData?.artist?.name || '') + '-' + toFilename(title) + '.jpg');
                } finally {
                  setAddingImage(false);
                }
              }}
              disabled={addingImage || !newImageUrl || !newImageName}
              style={{
                padding: '0.5rem 1rem',
                backgroundColor: '#10b981',
                color: 'white',
                border: 'none',
                borderRadius: '4px',
                fontSize: '0.875rem',
                cursor: (addingImage || !newImageUrl || !newImageName) ? 'not-allowed' : 'pointer',
                opacity: (addingImage || !newImageUrl || !newImageName) ? 0.6 : 1,
              }}
            >
              {addingImage ? 'Adding...' : 'Add Image'}
            </button>
          </div>
        </div>

        {/* Tags */}
        <div style={{ marginBottom: '1.5rem', padding: '1rem', backgroundColor: 'var(--color-bg-surface)', borderRadius: '4px', border: '1px solid var(--color-border)' }}>
          <h3 style={{ fontSize: '1.125rem', fontWeight: 'bold', marginBottom: '0.5rem', marginTop: 0 }}>Tags</h3>
          <TagsSection entityType="album" entityId={parseInt(id)} isLoggedIn={true} />
        </div>

        <div style={{ marginBottom: '1.5rem' }}>
          <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 'bold' }}>
            Wikipedia Slug
          </label>
          <input
            type="text"
            value={wikipedia}
            onChange={(e) => setWikipedia(e.target.value)}
            onPaste={(e) => {
              const text = e.clipboardData.getData('text');
              const parsed = parseWikipediaSlug(text);
              if (parsed !== text) {
                e.preventDefault();
                setWikipedia(parsed);
              }
            }}
            placeholder="e.g., Abbey_Road or a full wikipedia.org URL"
            autoCorrect="off"
            autoCapitalize="off"
            spellCheck="false"
            style={{
              width: '100%',
              padding: '0.5rem',
              fontSize: '1rem',
              border: '1px solid var(--color-border)',
              borderRadius: '4px',
            }}
          />
          <small style={{ color: 'var(--color-text-muted)', fontSize: '0.875rem' }}>
            The part after wikipedia.org/wiki/
          </small>
        </div>

        <div style={{ marginBottom: '1.5rem' }}>
          <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 'bold' }}>
            MusicBrainz
          </label>
          <MusicBrainzPicker
            entityType="release"
            value={musicbrainzId}
            mbidStatus={mbidStatus}
            searchDefault={title}
            pending={musicbrainzId !== (albumData.album.musicbrainz_id || '')}
            onChange={setMusicbrainzId}
          />
        </div>

        <div style={{ display: 'flex', gap: '1rem', marginTop: '2rem', flexWrap: 'wrap' }}>
          <button
            type="submit"
            disabled={saving}
            style={{
              padding: '0.75rem 1.5rem',
              backgroundColor: '#3b82f6',
              color: 'white',
              border: 'none',
              borderRadius: '4px',
              fontSize: '1rem',
              cursor: saving ? 'not-allowed' : 'pointer',
              opacity: saving ? 0.6 : 1,
            }}
          >
            {saving ? 'Saving...' : 'Save'}
          </button>

          <button
            type="button"
            onClick={handleCancel}
            disabled={saving}
            style={{
              padding: '0.75rem 1.5rem',
              backgroundColor: 'var(--color-text-muted)',
              color: 'white',
              border: 'none',
              borderRadius: '4px',
              fontSize: '1rem',
              cursor: saving ? 'not-allowed' : 'pointer',
            }}
          >
            Cancel
          </button>

          <button
            type="button"
            onClick={handleDelete}
            disabled={saving}
            style={{
              padding: '0.75rem 1.5rem',
              backgroundColor: '#ef4444',
              color: 'white',
              border: 'none',
              borderRadius: '4px',
              fontSize: '1rem',
              cursor: saving ? 'not-allowed' : 'pointer',
              marginLeft: 'auto',
            }}
          >
            Delete Album
          </button>
        </div>
      </form>

      <button
        type="button"
        onClick={() => setShowReprocessModal(true)}
        style={{ marginTop: '2rem', padding: '0.75rem 1.5rem', backgroundColor: 'var(--color-text-muted)', color: 'white', border: 'none', borderRadius: '4px', fontSize: '1rem', cursor: 'pointer' }}
      >
        Reprocess from Files
      </button>

      {showReprocessModal && (
        <ReprocessAlbumModal
          albumId={id}
          onClose={() => setShowReprocessModal(false)}
          onApplied={() => fetchAlbumData()}
        />
      )}

      {showDeleteModal && (
        <ConfirmDeleteModal
          title="Delete album"
          message={`Delete "${albumData?.album?.title}" and ${tracks.length} track${tracks.length === 1 ? '' : 's'}? This cannot be undone.`}
          onConfirm={confirmDelete}
          onCancel={() => setShowDeleteModal(false)}
        />
      )}

      {/* Transfer Section — Move to Artist or Merge into Album */}
      <div style={{ marginTop: '3rem', padding: '1.5rem', backgroundColor: 'var(--color-warning-bg)', borderRadius: '4px', border: '1px solid var(--color-warning-border)' }}>
        <h3 style={{ fontSize: '1.25rem', fontWeight: 'bold', marginBottom: '1rem', color: 'var(--color-warning-text)' }}>
          Transfer Album
        </h3>

        <div style={{ marginBottom: '1rem' }}>
          <select
            value={transferMode}
            onChange={e => handleTransferModeChange(e.target.value)}
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

        <form onSubmit={handleTransferSearch} style={{ marginBottom: '0.75rem' }}>
          <div style={{ display: 'flex', gap: '0.5rem' }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <input
                type="text"
                value={transferQuery}
                onChange={e => setTransferQuery(e.target.value)}
                placeholder={transferMode === 'move' ? 'Search for artist...' : 'Search for destination album...'}
                style={{ width: '100%', boxSizing: 'border-box', padding: '0.5rem', fontSize: '1rem', border: '1px solid var(--color-warning-border)', borderRadius: '4px', backgroundColor: 'var(--color-bg-surface)', color: 'var(--color-text-primary)' }}
              />
            </div>
            <button
              type="submit"
              disabled={transferSearching}
              style={{ padding: '0.5rem 1rem', backgroundColor: 'var(--color-text-muted)', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer' }}
            >
              {transferSearching ? 'Searching...' : 'Search'}
            </button>
          </div>
        </form>

        {transferResults.length > 0 && (
          <div style={{ border: '1px solid var(--color-warning-border)', borderRadius: '4px', marginBottom: '0.75rem', maxHeight: '200px', overflowY: 'auto', backgroundColor: 'var(--color-bg-surface)', color: 'var(--color-text-primary)' }}>
            {transferResults.map(item => {
              const isCurrent = transferMode === 'move'
                ? item.id === albumData?.album?.artist_id
                : String(item.id) === String(id);
              return (
                <div
                  key={item.id}
                  onClick={() => handleSelectTransferResult(item)}
                  style={{ padding: '0.5rem 0.75rem', cursor: 'pointer', borderBottom: '1px solid var(--color-warning-row-border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}
                  onMouseEnter={e => e.currentTarget.style.backgroundColor = 'var(--color-warning-bg-hover)'}
                  onMouseLeave={e => e.currentTarget.style.backgroundColor = ''}
                >
                  <span>
                    {item.name || item.title}
                    {isCurrent && <span style={{ color: 'var(--color-warning-text-muted)', fontStyle: 'italic' }}> (current)</span>}
                  </span>
                  <span style={{ fontSize: '0.8rem', color: 'var(--color-warning-text-muted)' }}>
                    {transferMode === 'move'
                      ? `${item.album_count != null ? `${item.album_count} albums` : ''}`
                      : `${item.artist?.name}${item.track_count != null ? ` · ${item.track_count} tracks` : ''}`}
                  </span>
                </div>
              );
            })}
          </div>
        )}

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
              {mergeDestAlbum.track_count != null && <span> ({mergeDestAlbum.track_count} tracks)</span>}
            </p>
            <label style={{ display: 'block', fontSize: '0.875rem', color: 'var(--color-warning-text)', marginBottom: '0.25rem' }}>
              Track number offset (0 = no change):
            </label>
            <input
              type="number"
              value={mergeOffset}
              onChange={e => setMergeOffset(e.target.value)}
              min="0"
              style={{ width: '100px', padding: '0.4rem', fontSize: '1rem', border: '1px solid var(--color-warning-border)', borderRadius: '4px', backgroundColor: 'var(--color-bg-surface)', color: 'var(--color-text-primary)' }}
            />
          </div>
        )}

        <button
          onClick={transferMode === 'move' ? handleMoveToArtist : handleMergeAlbum}
          disabled={transferMode === 'move' ? (movingToArtist || !targetArtistId) : (mergingAlbum || !mergeDestAlbum)}
          style={{
            padding: '0.75rem 1.5rem',
            backgroundColor: '#ff8c00',
            color: 'white',
            border: 'none',
            borderRadius: '4px',
            fontSize: '1rem',
            cursor: 'pointer',
            opacity: (transferMode === 'move' ? (movingToArtist || !targetArtistId) : (mergingAlbum || !mergeDestAlbum)) ? 0.6 : 1,
          }}
        >
          {transferMode === 'move'
            ? (movingToArtist ? 'Moving...' : 'Move Album to Artist')
            : (mergingAlbum ? 'Merging...' : 'Merge into Album')}
        </button>
      </div>

      {/* Additional Artists Section */}
      <div style={{
        marginTop: '3rem',
        padding: '1.5rem',
        backgroundColor: '#f0fdf4',
        borderRadius: '4px',
        border: '1px solid #86efac'
      }}>
        <h3 style={{ fontSize: '1.25rem', fontWeight: 'bold', marginBottom: '1rem', color: '#166534' }}>
          Additional Artists
        </h3>

        {secondaryArtists.length > 0 && (
          <div style={{ marginBottom: '1rem' }}>
            {secondaryArtists.map(a => (
              <div key={a.artist_id} style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                padding: '0.5rem 0',
                borderBottom: '1px solid #bbf7d0'
              }}>
                <span style={{ fontWeight: '500' }}>{a.name}</span>
                <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center' }}>
                  <span style={{
                    fontSize: '0.75rem',
                    padding: '0.2rem 0.5rem',
                    backgroundColor: '#dcfce7',
                    borderRadius: '9999px',
                    color: '#166534'
                  }}>{a.role}</span>
                  <button
                    type="button"
                    onClick={() => handleRemoveArtistFromAlbum(a.artist_id)}
                    style={{
                      padding: '0.25rem 0.5rem',
                      backgroundColor: '#ef4444',
                      color: 'white',
                      border: 'none',
                      borderRadius: '4px',
                      fontSize: '0.75rem',
                      cursor: 'pointer',
                    }}
                  >
                    Remove
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}

        {!showAddArtistSection ? (
          <button
            type="button"
            onClick={() => setShowAddArtistSection(true)}
            style={{
              padding: '0.5rem 1rem',
              backgroundColor: '#16a34a',
              color: 'white',
              border: 'none',
              borderRadius: '4px',
              fontSize: '0.875rem',
              cursor: 'pointer',
            }}
          >
            + Add Artist
          </button>
        ) : (
          <div>
            <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '0.75rem', alignItems: 'center' }}>
              <select
                value={addArtistRole}
                onChange={(e) => setAddArtistRole(e.target.value)}
                style={{
                  padding: '0.5rem',
                  fontSize: '0.875rem',
                  border: '1px solid #86efac',
                  borderRadius: '4px',
                  backgroundColor: 'var(--color-bg-surface)',
                }}
              >
                <option value="featured">Featured</option>
                <option value="collaborator">Collaborator</option>
                <option value="compilation">Compilation</option>
                <option value="guest">Guest</option>
                <option value="composer">Composer</option>
                <option value="performer">Performer</option>
              </select>
              <button
                type="button"
                onClick={() => { setShowAddArtistSection(false); setAddArtistResults([]); setAddArtistQuery(''); }}
                style={{
                  padding: '0.5rem',
                  backgroundColor: 'var(--color-text-muted)',
                  color: 'white',
                  border: 'none',
                  borderRadius: '4px',
                  fontSize: '0.875rem',
                  cursor: 'pointer',
                }}
              >
                Cancel
              </button>
            </div>
            <form onSubmit={handleAddArtistSearch} style={{ display: 'flex', gap: '0.5rem', marginBottom: '0.75rem' }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <input
                  type="text"
                  value={addArtistQuery}
                  onChange={(e) => setAddArtistQuery(e.target.value)}
                  placeholder="Search artist name..."
                  autoFocus
                  style={{
                    width: '100%',
                    boxSizing: 'border-box',
                    padding: '0.5rem',
                    fontSize: '0.875rem',
                    border: '1px solid #86efac',
                    borderRadius: '4px',
                  }}
                />
              </div>
              <button
                type="submit"
                disabled={addArtistSearching || addArtistQuery.length < 2}
                style={{
                  padding: '0.5rem 1rem',
                  backgroundColor: '#3b82f6',
                  color: 'white',
                  border: 'none',
                  borderRadius: '4px',
                  fontSize: '0.875rem',
                  cursor: 'pointer',
                }}
              >
                {addArtistSearching ? 'Searching...' : 'Search'}
              </button>
            </form>
            {addArtistResults.length > 0 && (
              <div style={{ maxHeight: '250px', overflowY: 'auto', border: '1px solid #86efac', borderRadius: '4px', backgroundColor: 'var(--color-bg-surface)' }}>
                {addArtistResults.map(artist => (
                  <div
                    key={artist.id}
                    style={{
                      padding: '0.6rem 0.75rem',
                      borderBottom: '1px solid var(--color-border)',
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                    }}
                  >
                    <span style={{ fontWeight: '500' }}>
                      {artist.name}
                      {artist.id === albumData?.album?.artist_id && (
                        <span style={{ color: 'var(--color-text-muted)', fontWeight: 'normal', fontStyle: 'italic' }}> (current primary artist)</span>
                      )}
                    </span>
                    <button
                      type="button"
                      onClick={() => handleAddArtistToAlbum(artist)}
                      style={{
                        padding: '0.25rem 0.75rem',
                        backgroundColor: '#16a34a',
                        color: 'white',
                        border: 'none',
                        borderRadius: '4px',
                        fontSize: '0.75rem',
                        cursor: 'pointer',
                      }}
                    >
                      Add as {addArtistRole}
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>


      {/* Tracks Section */}
      {tracks && tracks.length > 0 && (
        <div style={{ marginTop: '2rem' }}>
          <h2 style={{ fontSize: '1.5rem', fontWeight: 'bold', marginBottom: '1rem' }}>
            Individual Tracks
          </h2>

          <div style={{ overflowX: 'auto' }}>
            <table style={{
              width: '100%',
              borderCollapse: 'collapse',
              fontSize: '0.875rem'
            }}>
              <thead>
                <tr style={{ backgroundColor: 'var(--color-bg-surface-muted)', borderBottom: '2px solid var(--color-border)' }}>
                  <th style={{ padding: '0.75rem', textAlign: 'left', fontWeight: 'bold' }}>Track #</th>
                  <th style={{ padding: '0.75rem', textAlign: 'left', fontWeight: 'bold' }}>Title</th>
                  <th style={{ padding: '0.75rem', textAlign: 'left', fontWeight: 'bold' }}>Album ID</th>
                  <th style={{ padding: '0.75rem', textAlign: 'left', fontWeight: 'bold' }}>Artist</th>
                  <th style={{ padding: '0.75rem', textAlign: 'left', fontWeight: 'bold' }}>Duration</th>
                  <th style={{ padding: '0.75rem', textAlign: 'center', fontWeight: 'bold' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {tracks.sort((a, b) => (parseInt(a.track_number) || 0) - (parseInt(b.track_number) || 0)).map((track) => {
                  return (
                    <tr key={track.id} style={{ borderBottom: '1px solid var(--color-border)' }}>
                      <td style={{ padding: '0.75rem' }}>
                        <input
                          type="text"
                          defaultValue={track.track_number || ''}
                          onFocus={(e) => e.target.dataset.originalValue = e.target.value}
                          onChange={(e) => handleTrackFieldChange(track.id, 'track_number', e.target.value)}
                          onBlur={(e) => {
                            if (e.target.value !== e.target.dataset.originalValue) {
                              handleTrackBlur(track.id, 'track_number');
                            }
                          }}
                          style={{
                            width: '60px',
                            padding: '0.25rem 0.5rem',
                            border: '1px solid var(--color-border-strong)',
                            borderRadius: '4px',
                          }}
                        />
                      </td>
                      <td style={{ padding: '0.75rem' }}>
                        <input
                          type="text"
                          defaultValue={track.title || ''}
                          onFocus={(e) => e.target.dataset.originalValue = e.target.value}
                          onChange={(e) => handleTrackFieldChange(track.id, 'title', e.target.value)}
                          onBlur={(e) => {
                            if (e.target.value !== e.target.dataset.originalValue) {
                              handleTrackBlur(track.id, 'title');
                            }
                          }}
                          style={{
                            width: '100%',
                            minWidth: '200px',
                            padding: '0.25rem 0.5rem',
                            border: '1px solid var(--color-border-strong)',
                            borderRadius: '4px',
                          }}
                        />
                      </td>
                      <td style={{ padding: '0.75rem' }}>
                        <input
                          type="number"
                          defaultValue={track.album.id || ''}
                          onFocus={(e) => e.target.dataset.originalValue = e.target.value}
                          onChange={(e) => handleTrackFieldChange(track.id, 'album_id', parseInt(e.target.value))}
                          onBlur={(e) => {
                            if (e.target.value !== e.target.dataset.originalValue) {
                              handleTrackBlur(track.id, 'album_id');
                            }
                          }}
                          style={{
                            width: '80px',
                            padding: '0.25rem 0.5rem',
                            border: '1px solid var(--color-border-strong)',
                            borderRadius: '4px',
                          }}
                        />
                      </td>
                      <td style={{ padding: '0.75rem' }}>
                        <TrackArtistPicker
                          artistName={track.artist.name}
                          onSelect={(newArtistId, newArtistName) => handleTrackArtistSelect(track.id, newArtistId, newArtistName)}
                        />
                      </td>
                      <td style={{ padding: '0.75rem', color: 'var(--color-text-muted)' }}>
                        {formatDuration(track.duration) || '-'}
                      </td>
                      <td style={{ padding: '0.75rem', textAlign: 'center' }}>
                        {albumData?.album?.title !== '_Singles' && (
                          <button
                            onClick={() => handleMakeSingle(track)}
                            style={{
                              padding: '0.25rem 0.75rem',
                              marginRight: '0.5rem',
                              backgroundColor: 'var(--color-text-muted)',
                              color: 'white',
                              border: 'none',
                              borderRadius: '4px',
                              fontSize: '0.75rem',
                              cursor: 'pointer',
                            }}
                          >
                            Make Single
                          </button>
                        )}
                        <button
                          onClick={() => handleDeleteTrack(track.id)}
                          style={{
                            padding: '0.25rem 0.75rem',
                            backgroundColor: '#ef4444',
                            color: 'white',
                            border: 'none',
                            borderRadius: '4px',
                            fontSize: '0.75rem',
                            cursor: 'pointer',
                          }}
                        >
                          Delete
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

    </div>
  );
};

export default AdminAlbum;

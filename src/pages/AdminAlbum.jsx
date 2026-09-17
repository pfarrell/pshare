// src/pages/AdminAlbum.jsx
import { useCallback, useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { apiService } from '../services/api';
import { useUnsavedChangesGuard } from '../hooks/useUnsavedChangesGuard';
import Loading from '../components/Loading';
import PageError from '../components/PageError';
import ConfirmDeleteModal from '../components/ConfirmDeleteModal';
import TagsSection from '../components/TagsSection';
import MusicBrainzPicker from '../components/MusicBrainzPicker';
import ReprocessAlbumModal from '../components/ReprocessAlbumModal';
import AdminPanel from '../components/admin/AdminPanel';
import AdminField from '../components/admin/AdminField';
import EntityImageGallery from '../components/admin/EntityImageGallery';
import WikipediaSlugInput from '../components/admin/WikipediaSlugInput';
import AdminFormActions from '../components/admin/AdminFormActions';
import AlbumTransferSection from './admin/album/AlbumTransferSection';
import AlbumAdditionalArtistsSection from './admin/album/AlbumAdditionalArtistsSection';
import AlbumTracksTable from './admin/album/AlbumTracksTable';
import { formatCount } from '../utils/formatters';
import { toFilename } from '../utils/filenames';

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

  // Tracks state
  const [tracks, setTracks] = useState([]);

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
      setReleaseYear(album.release_year || '');
      setImagePath(album.image_path || '');
      setWikipedia(album.wikipedia || '');
      setMusicbrainzId(album.musicbrainz_id || '');
      setMbidStatus(album.mbid_status || '');
      setIsCompilation(!!album.is_compilation);
      setTracks(tracks || []);
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

  const { navigateAway } = useUnsavedChangesGuard({
    isDirty: hasUnsavedChanges,
    save: saveAlbum,
    onSaveError: (error) => {
      console.error('Error saving album:', error);
      setError(error.response?.data?.error || 'Failed to save album');
    },
  });

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

  const handleCancel = () => {
    navigateAway(`/album/${id}`);
  };

  const handleNavigateBack = (e) => {
    e.preventDefault();
    navigateAway(`/album/${id}`);
  };

  if (loading) {
    return <Loading message="Loading album" />;
  }

  if (error && !albumData) {
    return <PageError message={error} />;
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

      {error && <div className="admin-error-banner">{error}</div>}

      <form onSubmit={handleSave}>
        <AdminField label="Title *" htmlFor="album-title">
          <input
            id="album-title"
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            required
            className="admin-input"
          />
        </AdminField>

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

        <AdminField label="Release Year" htmlFor="album-release-year">
          <input
            id="album-release-year"
            type="text"
            value={releaseYear}
            onChange={(e) => setReleaseYear(e.target.value)}
            placeholder="e.g., 1969"
            className="admin-input"
          />
        </AdminField>

        <AdminField label="Image Path" htmlFor="album-image-path">
          <input
            id="album-image-path"
            type="text"
            value={imagePath}
            onChange={(e) => setImagePath(e.target.value)}
            placeholder="e.g., abbey_road.jpg"
            className="admin-input"
          />
          {imagePath && (
            <img
              src={apiService.getImageUrl(imagePath, 'album_page')}
              alt="Preview"
              style={{ marginTop: '0.5rem', maxWidth: '200px', borderRadius: '4px' }}
            />
          )}
        </AdminField>

        <EntityImageGallery
          kind="album"
          entityId={id}
          defaultFilename={`${toFilename(albumData?.artist?.name || '')}-${toFilename(title)}.jpg`}
          onPrimaryChange={setImagePath}
        />

        {/* Tags */}
        <div style={{ marginBottom: '1.5rem', padding: '1rem', backgroundColor: 'var(--color-bg-surface)', borderRadius: '4px', border: '1px solid var(--color-border)' }}>
          <h3 style={{ fontSize: '1.125rem', fontWeight: 'bold', marginBottom: '0.5rem', marginTop: 0 }}>Tags</h3>
          <TagsSection entityType="album" entityId={parseInt(id)} isLoggedIn={true} />
        </div>

        <AdminField label="Wikipedia Slug" htmlFor="album-wikipedia" help="The part after wikipedia.org/wiki/">
          <WikipediaSlugInput
            id="album-wikipedia"
            value={wikipedia}
            onChange={setWikipedia}
            placeholder="e.g., Abbey_Road or a full wikipedia.org URL"
          />
        </AdminField>

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

        <AdminFormActions saving={saving} onCancel={handleCancel} onDelete={handleDelete} deleteLabel="Delete Album" />
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
          message={`Delete "${albumData?.album?.title}" and ${formatCount(tracks.length, 'track')}? This cannot be undone.`}
          onConfirm={confirmDelete}
          onCancel={() => setShowDeleteModal(false)}
        />
      )}

      <AlbumTransferSection albumId={id} album={albumData?.album} onError={setError} />

      <AlbumAdditionalArtistsSection albumId={id} primaryArtistId={albumData?.album?.artist_id} />

      <AlbumTracksTable
        tracks={tracks}
        setTracks={setTracks}
        isSinglesAlbum={albumData?.album?.title === '_Singles'}
      />

    </div>
  );
};

export default AdminAlbum;

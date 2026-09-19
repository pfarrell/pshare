// src/pages/AdminArtist.jsx
import { useCallback, useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { apiService } from '../services/api';
import { useUnsavedChangesGuard } from '../hooks/useUnsavedChangesGuard';
import Loading from '../components/Loading';
import PageError from '../components/PageError';
import ConfirmDeleteModal from '../components/ConfirmDeleteModal';
import TagsSection from '../components/TagsSection';
import MusicBrainzPicker from '../components/MusicBrainzPicker';
import AdminPanel from '../components/admin/AdminPanel';
import AdminField from '../components/admin/AdminField';
import EntityImageGallery from '../components/admin/EntityImageGallery';
import WikipediaSlugInput from '../components/admin/WikipediaSlugInput';
import AdminFormActions from '../components/admin/AdminFormActions';
import ArtistRelationsSection from './admin/artist/ArtistRelationsSection';
import ArtistMergeSection from './admin/artist/ArtistMergeSection';
import { toFilename } from '../utils/filenames';
import { formatCount } from '../utils/formatters';

const AdminArtist = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const [artistData, setArtistData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [saving, setSaving] = useState(false);

  // Form state
  const [name, setName] = useState('');
  const [imagePath, setImagePath] = useState('');
  const [wikipedia, setWikipedia] = useState('');
  const [musicbrainzId, setMusicbrainzId] = useState('');
  const [mbidStatus, setMbidStatus] = useState('');

  // Track if form has unsaved changes
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);

  // State for the page
  const [ownAlbumCount, setOwnAlbumCount] = useState(0);
  const [ownTrackCount, setOwnTrackCount] = useState(0);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [relationsReloadKey, setRelationsReloadKey] = useState(0);

  useEffect(() => {
    const fetchArtistData = async () => {
      try {
        setLoading(true);
        const response = await apiService.getArtist(id);
        const { artist } = response.data;
        setArtistData(artist);
        setOwnAlbumCount(response.data.albums?.length ?? 0);
        setOwnTrackCount((response.data.albums || []).reduce((sum, a) => sum + (a.track_count ?? 0), 0));
        setName(artist.name || '');
        setImagePath(artist.image_path || '');
        setWikipedia(artist.wikipedia || '');
        setMusicbrainzId(artist.musicbrainz_id || '');
        setMbidStatus(artist.mbid_status || '');
      } catch (error) {
        console.error('Error fetching artist data:', error);
        setError('Failed to load artist');
      } finally {
        setLoading(false);
      }
    };

    if (id) {
      fetchArtistData();
    }
  }, [id]);

  // Track changes to form fields
  useEffect(() => {
    if (!artistData) return;

    const hasChanges =
      name !== (artistData.name || '') ||
      imagePath !== (artistData.image_path || '') ||
      wikipedia !== (artistData.wikipedia || '') ||
      musicbrainzId !== (artistData.musicbrainz_id || '');

    setHasUnsavedChanges(hasChanges);
  }, [name, imagePath, wikipedia, musicbrainzId, artistData]);

  // Just the API call, no navigation — shared by the form submit, the
  // link-click guard below, and the pull-to-refresh save prompt in Layout
  // (registered via unsavedChangesStore below).
  const saveArtist = useCallback(async () => {
    await apiService.updateArtist(id, {
      name,
      image_path: imagePath,
      wikipedia,
      musicbrainz_id: musicbrainzId,
    });
    setHasUnsavedChanges(false);
  }, [id, name, imagePath, wikipedia, musicbrainzId]);

  const { navigateAway } = useUnsavedChangesGuard({
    isDirty: hasUnsavedChanges,
    save: saveArtist,
    onSaveError: (error) => {
      console.error('Error saving artist:', error);
      setError(error.response?.data?.error || 'Failed to save artist');
    },
  });

  const handleSave = async (e) => {
    e.preventDefault();
    setSaving(true);
    setError(null);

    try {
      await saveArtist();

      // Redirect to regular artist page after successful save
      navigate(`/artist/${id}`);
    } catch (error) {
      console.error('Error updating artist:', error);
      setError(error.response?.data?.error || 'Failed to update artist');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = () => {
    setShowDeleteModal(true);
  };

  const confirmDelete = async () => {
    await apiService.deleteArtist(id);
    navigate('/');
  };

  const handleCancel = () => {
    navigateAway(`/artist/${id}`);
  };

  const handleNavigateBack = (e) => {
    e.preventDefault();
    navigateAway(`/artist/${id}`);
  };

  if (loading) {
    return <Loading message="Loading artist" />;
  }

  if (error && !artistData) {
    return <PageError message={error} />;
  }

  return (
    <div className="admin-page" style={{ padding: '2rem', maxWidth: '800px', margin: '0 auto' }}>
      <div style={{ marginBottom: '1rem' }}>
        <a
          href={`/artist/${id}`}
          onClick={handleNavigateBack}
          className="admin-back-link"
          style={{
            color: '#3b82f6',
            textDecoration: 'none',
            fontSize: '0.875rem'
          }}
        >
          ← Back to Artist Page
        </a>
      </div>
      <h1 style={{ marginBottom: '2rem', fontSize: '2rem' }}>Edit Artist</h1>

      {error && <div className="admin-error-banner">{error}</div>}

      <form onSubmit={handleSave}>
        <AdminField label="Name *" htmlFor="artist-name">
          <input
            id="artist-name"
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
            className="admin-input"
          />
        </AdminField>

        <AdminField label="Image Path" htmlFor="artist-image-path">
          <input
            id="artist-image-path"
            type="text"
            value={imagePath}
            onChange={(e) => setImagePath(e.target.value)}
            placeholder="e.g., beatles.jpg"
            className="admin-input"
          />
          {imagePath && (
            <img
              src={apiService.getImageUrl(imagePath, 'artist_page')}
              alt="Preview"
              style={{ marginTop: '0.5rem', maxWidth: '200px', borderRadius: '4px' }}
            />
          )}
        </AdminField>

        <EntityImageGallery
          kind="artist"
          entityId={id}
          defaultFilename={`${toFilename(name)}.jpg`}
          onPrimaryChange={setImagePath}
        />

        {/* Tags */}
        <div style={{ marginBottom: '1.5rem', padding: '1rem', backgroundColor: 'var(--color-bg-surface)', borderRadius: '4px', border: '1px solid var(--color-border)' }}>
          <h3 style={{ fontSize: '1.125rem', fontWeight: 'bold', marginBottom: '0.5rem', marginTop: 0 }}>Tags</h3>
          <TagsSection entityType="artist" entityId={parseInt(id)} isLoggedIn={true} />
        </div>

        <AdminField label="Wikipedia Slug" htmlFor="artist-wikipedia" help="The part after wikipedia.org/wiki/">
          <WikipediaSlugInput
            id="artist-wikipedia"
            value={wikipedia}
            onChange={setWikipedia}
            placeholder="e.g., The_Beatles or a full wikipedia.org URL"
          />
        </AdminField>

        <div style={{ marginBottom: '1.5rem' }}>
          <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 'bold' }}>
            MusicBrainz
          </label>
          <MusicBrainzPicker
            entityType="artist"
            value={musicbrainzId}
            mbidStatus={mbidStatus}
            searchDefault={name}
            pending={musicbrainzId !== (artistData.musicbrainz_id || '')}
            onChange={setMusicbrainzId}
          />
        </div>

        <AdminFormActions saving={saving} onCancel={handleCancel} onDelete={handleDelete} deleteLabel="Delete Artist" />
      </form>

      <ArtistRelationsSection artistId={id} reloadKey={relationsReloadKey} />

      <ArtistMergeSection
        artistId={id}
        artistName={artistData.name}
        ownAlbumCount={ownAlbumCount}
        onMergedKeepingThis={() => setRelationsReloadKey((k) => k + 1)}
        onError={setError}
      />

      {showDeleteModal && (
        <ConfirmDeleteModal
          title="Delete artist"
          message={`Delete "${artistData.name}" and ${formatCount(ownAlbumCount, 'album')}, ${formatCount(ownTrackCount, 'track')}? This cannot be undone.`}
          onConfirm={confirmDelete}
          onCancel={() => setShowDeleteModal(false)}
        />
      )}
    </div>
  );
};

export default AdminArtist;

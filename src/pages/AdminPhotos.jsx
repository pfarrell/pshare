// src/pages/AdminPhotos.jsx
import { useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import { apiService } from '../services/api';
import { getErrorMessage } from '../utils/errors';

// Personal-photo management for the jukebox kiosk's photo-frame screensaver
// mode (see docs/superpowers/specs/2026-09-28-jukebox-photo-frame-design.md).
// A flat pool, no editing/captions/reordering — upload adds one, delete
// removes one. Uploads immediately on file selection: unlike
// EntityImageGallery's add-by-URL flow, there's no name field to fill in
// first, since the stored filename is always server-generated.
const AdminPhotos = () => {
  const [photos, setPhotos] = useState(null);
  const [uploading, setUploading] = useState(false);

  const reload = () => apiService.getAdminPhotos().then((res) => setPhotos(res.data));

  useEffect(() => {
    reload().catch((err) => {
      console.error('Failed to load photos:', err);
      setPhotos([]);
    });
  }, []);

  const handleFileChange = async (e) => {
    const file = e.target.files[0];
    e.target.value = ''; // allow re-selecting the same file later
    if (!file) return;

    setUploading(true);
    try {
      await apiService.uploadPhoto(file);
      await reload();
      toast.success('Photo added');
    } catch (err) {
      toast.error(getErrorMessage(err, 'Failed to upload photo'));
    } finally {
      setUploading(false);
    }
  };

  const handleDelete = async (photo) => {
    if (!window.confirm('Delete this photo?')) return;
    try {
      await apiService.deletePhoto(photo.id);
      setPhotos((prev) => prev.filter((p) => p.id !== photo.id));
    } catch (err) {
      toast.error(getErrorMessage(err, 'Failed to delete photo'));
    }
  };

  return (
    <div style={{ maxWidth: '900px', margin: '0 auto', padding: '2rem 1rem' }}>
      <h1 style={{ fontSize: '1.5rem', fontWeight: 'bold', color: 'var(--color-text-primary)', marginBottom: '1.5rem' }}>Photos</h1>

      <div style={{ marginBottom: '1.5rem' }}>
        <label style={{ display: 'inline-block', padding: '0.625rem 1rem', backgroundColor: '#3b82f6', color: 'white', borderRadius: '6px', fontSize: '0.875rem', fontWeight: '500', cursor: uploading ? 'default' : 'pointer', opacity: uploading ? 0.6 : 1 }}>
          {uploading ? 'Uploading…' : 'Upload Photo'}
          <input type="file" accept="image/*" onChange={handleFileChange} disabled={uploading} style={{ display: 'none' }} />
        </label>
      </div>

      {photos === null ? (
        <p style={{ color: 'var(--color-text-muted)' }}>Loading…</p>
      ) : photos.length === 0 ? (
        <p style={{ color: 'var(--color-text-muted)' }}>No photos yet.</p>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))', gap: '1rem' }}>
          {photos.map((photo) => (
            <div key={photo.id} style={{ border: '1px solid var(--color-border)', borderRadius: '8px', padding: '0.5rem' }}>
              <img
                src={apiService.getImageUrl(photo.image_path, 'photo_small')}
                alt="Photo"
                style={{ width: '100%', height: '120px', objectFit: 'cover', borderRadius: '4px' }}
              />
              <button
                type="button"
                onClick={() => handleDelete(photo)}
                style={{ marginTop: '0.5rem', width: '100%', padding: '0.35rem', fontSize: '0.75rem', color: '#f87171', background: 'none', border: '1px solid var(--color-border)', borderRadius: '4px', cursor: 'pointer' }}
              >
                Delete
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default AdminPhotos;

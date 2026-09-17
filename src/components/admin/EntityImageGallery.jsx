// src/components/admin/EntityImageGallery.jsx
import { useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import { apiService } from '../../services/api';
import { getErrorMessage } from '../../utils/errors';

const IMAGE_CONTEXT = { artist: 'artist_page', album: 'album_page' };

// Image gallery for an artist or album admin page: shows every stored image,
// lets the admin pick the primary one or delete one, and downloads a new
// image from a URL. The first image added becomes primary automatically.
const EntityImageGallery = ({ kind, entityId, defaultFilename, onPrimaryChange }) => {
  const imagesApi = apiService.entityImages[kind];
  const [images, setImages] = useState([]);
  const [newImageUrl, setNewImageUrl] = useState('');
  const [newImageName, setNewImageName] = useState(defaultFilename);
  const [adding, setAdding] = useState(false);

  useEffect(() => {
    let cancelled = false;
    imagesApi.list(entityId)
      .then((res) => { if (!cancelled) setImages(res.data); })
      .catch((err) => console.error(`Error loading ${kind} images:`, err));
    return () => { cancelled = true; };
    // imagesApi is a stable module-level object per kind.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [kind, entityId]);

  const reload = async () => {
    const res = await imagesApi.list(entityId);
    setImages(res.data);
  };

  const handleSetPrimary = async (img) => {
    try {
      await imagesApi.setPrimary(entityId, img.id);
      await reload();
      onPrimaryChange(img.path);
    } catch (err) {
      toast.error(getErrorMessage(err, 'Failed to set primary image'));
    }
  };

  const handleDelete = async (img) => {
    if (!window.confirm('Delete this image?')) return;
    try {
      await imagesApi.remove(entityId, img.id);
      setImages((prev) => prev.filter((i) => i.id !== img.id));
    } catch (err) {
      toast.error(getErrorMessage(err, 'Failed to delete image'));
    }
  };

  const handleAdd = async () => {
    if (!newImageUrl || !newImageName) return;
    setAdding(true);
    try {
      const setPrimary = images.length === 0;
      await imagesApi.add(entityId, newImageUrl, newImageName, setPrimary);
      await reload();
      if (setPrimary) onPrimaryChange(newImageName);
      setNewImageUrl('');
      setNewImageName(defaultFilename);
      toast.success('Image added');
    } catch (err) {
      toast.error(getErrorMessage(err, 'Failed to add image'));
    } finally {
      setAdding(false);
    }
  };

  const addDisabled = adding || !newImageUrl || !newImageName;

  return (
    <div style={{ marginBottom: '1.5rem', padding: '1rem', backgroundColor: 'var(--color-bg-surface)', borderRadius: '4px', border: '1px solid var(--color-border)' }}>
      <h3 style={{ fontSize: '1.125rem', fontWeight: 'bold', marginBottom: '1rem' }}>Images</h3>

      {images.length > 0 && (
        <div style={{ display: 'flex', flexWrap: 'nowrap', gap: '12px', marginBottom: '16px', overflowX: 'auto', paddingBottom: '8px' }}>
          {images.map((img) => (
            <div
              key={img.id}
              style={{
                border: img.is_primary ? '2px solid #4ade80' : '2px solid var(--color-text-secondary)',
                borderRadius: '8px',
                padding: '8px',
                width: '120px',
              }}
            >
              <img
                src={apiService.getImageUrl(img.path, IMAGE_CONTEXT[kind])}
                alt=""
                style={{ width: '100%', height: '100px', objectFit: 'cover', borderRadius: '4px' }}
              />
              <div style={{ fontSize: '11px', color: 'var(--color-text-faint)', marginTop: '4px' }}>{img.source}</div>
              {img.status === 'proposed' && <div style={{ fontSize: '11px', color: '#facc15' }}>proposed</div>}
              <div style={{ display: 'flex', gap: '4px', marginTop: '6px' }}>
                {img.is_primary ? (
                  <span style={{ fontSize: '11px', color: '#4ade80' }}>✓ Primary</span>
                ) : (
                  <button type="button" onClick={() => handleSetPrimary(img)} style={{ fontSize: '11px', padding: '2px 6px' }}>
                    Set Primary
                  </button>
                )}
                <button type="button" onClick={() => handleDelete(img)} style={{ fontSize: '11px', padding: '2px 6px', color: '#f87171' }}>
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
            onChange={(e) => setNewImageUrl(e.target.value)}
            placeholder="https://..."
            className="admin-input"
          />
        </div>
        <div>
          <label style={{ display: 'block', marginBottom: '0.25rem', fontWeight: 'bold', fontSize: '0.875rem' }}>File name</label>
          <input
            type="text"
            value={newImageName}
            onChange={(e) => setNewImageName(e.target.value)}
            placeholder={`${kind}_123.jpg`}
            style={{ padding: '0.5rem', fontSize: '1rem', border: '1px solid var(--color-border)', borderRadius: '4px' }}
          />
        </div>
        <button type="button" className="btn btn-success" onClick={handleAdd} disabled={addDisabled}>
          {adding ? 'Adding...' : 'Add Image'}
        </button>
      </div>
    </div>
  );
};

export default EntityImageGallery;

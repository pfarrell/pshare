// src/pages/AdminCollection.jsx
import { useCallback, useEffect, useRef, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { apiService } from '../services/api';
import { useAuthStore } from '../stores/authStore';
import { useUnsavedChangesGuard } from '../hooks/useUnsavedChangesGuard';
import { useEntitySearch } from '../hooks/useEntitySearch';
import WikipediaSlugInput from '../components/admin/WikipediaSlugInput';
import EntitySearchPicker from '../components/admin/EntitySearchPicker';
import ReorderableList from '../components/admin/ReorderableList';
import { handleSmallImageError } from '../utils/imageFallback';
import { formatCount } from '../utils/formatters';

const CollectionAlbumRowContent = ({ item, index, onRemove }) => (
  <>
    <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', flex: 1 }}>
      <span style={{ color: 'var(--color-text-muted)', fontSize: '0.875rem', width: '2rem' }}>{index + 1}</span>
      <span style={{ fontSize: '1.5rem', color: 'var(--color-text-faint)', cursor: 'move' }}>☰</span>
      {item.data.image_path && (
        <img
          src={apiService.getImageUrl(item.data.image_path, 'album_small')}
          alt={item.data.title}
          style={{ width: '40px', height: '40px', objectFit: 'cover', borderRadius: '4px' }}
          onError={handleSmallImageError}
        />
      )}
      <div>
        <div style={{ fontWeight: '500' }}>{item.data.title}</div>
        <div style={{ fontSize: '0.875rem', color: 'var(--color-text-muted)' }}>{item.data.artist?.name}</div>
      </div>
    </div>
    <button type="button" className="btn btn-danger" onClick={() => onRemove(item.data.id)}>Remove</button>
  </>
);

const CollectionStubRowContent = ({ item, index, onResolve, onRemove }) => (
  <>
    <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', flex: 1 }}>
      <span style={{ color: 'var(--color-text-muted)', fontSize: '0.875rem', width: '2rem' }}>{index + 1}</span>
      <span style={{ fontSize: '1.5rem', color: 'var(--color-text-faint)', cursor: 'move' }}>☰</span>
      <div style={{
        width: '40px', height: '40px', borderRadius: '4px', border: '2px dashed var(--color-text-faint)',
        display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--color-text-faint)',
      }}>▢</div>
      <div>
        <div style={{ fontWeight: '500' }}>{item.data.title}</div>
        <div style={{ fontSize: '0.875rem', color: 'var(--color-text-muted)' }}>{item.data.artist_name}</div>
      </div>
    </div>
    <div style={{ display: 'flex', gap: '0.5rem' }}>
      <button type="button" className="btn btn-primary" onClick={() => onResolve(item.data.id)}>Resolve</button>
      <button type="button" className="btn btn-danger" onClick={() => onRemove(item.data.id)}>Remove Placeholder</button>
    </div>
  </>
);

export default function AdminCollection() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { user, isAdmin } = useAuthStore();
  const [collectionData, setCollectionData] = useState(null);
  const [originalData, setOriginalData] = useState(null);
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const [albums, setAlbums] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const searchPanelRef = useRef(null);

  // Search to add albums
  const albumSearch = useEntitySearch('album', { minLength: 1 });
  const [showSearch, setShowSearch] = useState(false);

  // Placeholder stubs
  const [stubs, setStubs] = useState([]);
  const [showStubForm, setShowStubForm] = useState(false);
  const [stubTitle, setStubTitle] = useState('');
  const [stubArtistName, setStubArtistName] = useState('');
  const [resolvingStubId, setResolvingStubId] = useState(null);

  // Image download
  const [imageUrl, setImageUrl] = useState('');
  const [imageName, setImageName] = useState('');
  const [downloadingImage, setDownloadingImage] = useState(false);

  useEffect(() => {
    loadCollection();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  useEffect(() => {
    if (loading || !collectionData) return;
    if (!(isAdmin || (user && collectionData.user_id === user.id))) {
      navigate(`/collection/${id}`, { replace: true });
    }
  }, [loading, collectionData, isAdmin, user, id, navigate]);

  // The search/resolve panel renders above the albums list — on a long list,
  // opening it (including via Resolve, deep in the list) would otherwise land
  // far outside the current scroll position with nothing visibly changing.
  useEffect(() => {
    if (showSearch && searchPanelRef.current) {
      searchPanelRef.current.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }, [showSearch]);

  const loadCollection = async () => {
    try {
      setLoading(true);
      const response = await apiService.getCollection(id);
      setCollectionData(response.data.collection);
      setOriginalData(response.data.collection);
      setAlbums(response.data.albums || []);
      setStubs(response.data.stubs || []);
    } catch (err) {
      console.error('Failed to load collection:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleAddAlbum = async (album) => {
    if (resolvingStubId) {
      return handleResolveStub(album);
    }
    if (albums.some(a => a.id === album.id)) {
      alert('This album is already in the collection');
      return;
    }
    try {
      await apiService.addAlbumToCollection(id, album.id);
      const maxOrder = Math.max(
        0,
        ...albums.map(a => a.order ?? 0),
        ...stubs.map(s => s.order ?? 0),
      );
      setAlbums([...albums, { ...album, order: maxOrder + 1, artist: album.artist || { id: null, name: album.artist_name || '' } }]);
      setShowSearch(false);
      albumSearch.reset();
    } catch (err) {
      console.error('Failed to add album:', err);
      alert('Failed to add album');
    }
  };

  const handleResolveStub = async (album) => {
    try {
      await apiService.resolveStub(id, resolvingStubId, album.id);
      const resolvedStub = stubs.find(s => s.id === resolvingStubId);
      setStubs(stubs.filter(s => s.id !== resolvingStubId));
      setAlbums([...albums, { ...album, order: resolvedStub?.order, artist: album.artist || { id: null, name: album.artist_name || '' } }]);
      setResolvingStubId(null);
      setShowSearch(false);
      albumSearch.reset();
    } catch (err) {
      console.error('Failed to resolve stub:', err);
      alert(err.response?.data?.error || 'Failed to resolve placeholder');
    }
  };

  const handleRemoveStub = async (stubId) => {
    if (!confirm('Remove this placeholder?')) return;
    try {
      await apiService.removeStubFromCollection(id, stubId);
      setStubs(stubs.filter(s => s.id !== stubId));
    } catch (err) {
      console.error('Failed to remove stub:', err);
      alert('Failed to remove placeholder');
    }
  };

  const handleAddStub = async () => {
    if (!stubTitle.trim()) return;
    try {
      const response = await apiService.addStubToCollection(id, stubTitle.trim(), stubArtistName.trim());
      setStubs([...stubs, response.data.stub]);
      setShowStubForm(false);
      setStubTitle('');
      setStubArtistName('');
    } catch (err) {
      console.error('Failed to add stub:', err);
      alert('Failed to add placeholder');
    }
  };

  const handleRemoveAlbum = async (albumId) => {
    if (!confirm('Remove this album from the collection?')) return;
    try {
      await apiService.removeAlbumFromCollection(id, albumId);
      setAlbums(albums.filter(a => a.id !== albumId));
    } catch (err) {
      console.error('Failed to remove album:', err);
      alert('Failed to remove album');
    }
  };

  const buildMergedItems = () => [
    ...albums.map((album) => ({ type: 'album', order: album.order ?? 0, data: album })),
    ...stubs.map((stub) => ({ type: 'stub', order: stub.order ?? 0, data: stub })),
  ].sort((a, b) => a.order - b.order);

  // Recomputes order for a fully-reordered merged list, applies it
  // optimistically, then persists it — shared by drag-and-drop and the
  // context menu's Send to Top/Bottom actions.
  const persistReorder = async (reordered) => {
    const withNewOrder = reordered.map((item, i) => ({ ...item, order: i + 1 }));
    setAlbums(withNewOrder.filter((i) => i.type === 'album').map((i) => ({ ...i.data, order: i.order })));
    setStubs(withNewOrder.filter((i) => i.type === 'stub').map((i) => ({ ...i.data, order: i.order })));

    try {
      const album_orders = withNewOrder.filter((i) => i.type === 'album').map((i) => ({ album_id: i.data.id, order: i.order }));
      const stub_orders = withNewOrder.filter((i) => i.type === 'stub').map((i) => ({ stub_id: i.data.id, order: i.order }));
      await apiService.reorderCollectionAlbums(id, album_orders, stub_orders);
    } catch (err) {
      console.error('Failed to reorder collection:', err);
      alert('Failed to save order');
      loadCollection();
    }
  };

  // Track changes to the editable fields
  useEffect(() => {
    if (!collectionData || !originalData) return;
    const hasChanges =
      collectionData.name !== originalData.name ||
      collectionData.image_path !== originalData.image_path ||
      collectionData.wikipedia !== originalData.wikipedia;
    setHasUnsavedChanges(hasChanges);
  }, [collectionData, originalData]);

  // Just the API call, no navigation — shared by the Save button, the
  // link-click guard below, and the pull-to-refresh save prompt in Layout
  // (registered via unsavedChangesStore).
  const saveCollection = useCallback(async () => {
    await apiService.updateCollection(id, {
      name: collectionData.name,
      image_path: collectionData.image_path,
      wikipedia: collectionData.wikipedia,
    });
    setOriginalData(collectionData);
    setHasUnsavedChanges(false);
  }, [id, collectionData]);

  useUnsavedChangesGuard({
    isDirty: hasUnsavedChanges,
    save: saveCollection,
    onSaveError: (err) => {
      console.error('Failed to save collection:', err);
      alert('Failed to save collection');
    },
  });

  const handleSave = async () => {
    try {
      setSaving(true);
      await saveCollection();
      navigate(`/collection/${id}`);
    } catch (err) {
      console.error('Failed to save collection:', err);
      alert('Failed to save collection');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!window.confirm(`Are you sure you want to delete "${collectionData?.name}"? This does not delete any albums — only the collection itself. This cannot be undone.`)) {
      return;
    }

    setSaving(true);

    try {
      await apiService.deleteCollection(id);
      navigate('/collections');
    } catch (err) {
      console.error('Failed to delete collection:', err);
      alert(err.response?.data?.error || 'Failed to delete collection');
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
      await apiService.downloadCollectionImage(id, imageUrl, imageName);
      setCollectionData(prev => ({ ...prev, image_path: imageName }));
      setImageUrl('');
      setImageName('');
      await loadCollection();
    } catch (error) {
      console.error('Error downloading image:', error);
      alert(error.response?.data?.error || 'Failed to download image');
    } finally {
      setDownloadingImage(false);
    }
  };

  const canEdit = isAdmin || (user && collectionData?.user_id === user.id);

  if (loading) return <div style={{ padding: '2rem' }}>Loading...</div>;
  if (!canEdit) return null;

  return (
    <div style={{ padding: '2rem', backgroundColor: 'var(--color-bg-surface-muted)', minHeight: '100%' }}>
      {/* Header */}
      <div style={{ marginBottom: '2rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h1 style={{ fontSize: '2rem', fontWeight: 'bold', color: 'var(--color-text-primary)' }}>Edit Collection</h1>
        <div style={{ display: 'flex', gap: '1rem' }}>
          <button
            onClick={() => navigate(`/collection/${id}`)}
            style={{
              padding: '0.5rem 1rem', backgroundColor: 'var(--color-text-muted)', color: 'white',
              border: 'none', borderRadius: '4px', cursor: 'pointer',
            }}
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            style={{
              padding: '0.5rem 1rem', backgroundColor: '#3b82f6', color: 'white',
              border: 'none', borderRadius: '4px',
              cursor: saving ? 'not-allowed' : 'pointer', opacity: saving ? 0.5 : 1,
            }}
          >
            {saving ? 'Saving...' : 'Save'}
          </button>
          <button
            onClick={handleDelete}
            disabled={saving}
            style={{
              padding: '0.5rem 1rem', backgroundColor: '#ef4444', color: 'white',
              border: 'none', borderRadius: '4px',
              cursor: saving ? 'not-allowed' : 'pointer', opacity: saving ? 0.5 : 1,
            }}
          >
            Delete
          </button>
        </div>
      </div>

      {/* Metadata */}
      <div style={{
        backgroundColor: 'var(--color-bg-surface)', padding: '1.5rem', borderRadius: '0.5rem',
        marginBottom: '2rem', boxShadow: '0 1px 3px 0 rgba(0, 0, 0, 0.1)'
      }}>
        <div style={{ marginBottom: '1rem' }}>
          <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: '500' }}>
            Collection Name
          </label>
          <input
            type="text"
            value={collectionData?.name || ''}
            onChange={(e) => setCollectionData({ ...collectionData, name: e.target.value })}
            style={{
              width: '100%', padding: '0.5rem', border: '1px solid var(--color-border-strong)',
              borderRadius: '4px', fontSize: '1rem',
            }}
          />
        </div>

        <div style={{ marginBottom: '1rem' }}>
          <label htmlFor="collection-wikipedia" style={{ display: 'block', marginBottom: '0.5rem', fontWeight: '500' }}>
            Wikipedia
          </label>
          <WikipediaSlugInput
            id="collection-wikipedia"
            value={collectionData?.wikipedia || ''}
            onChange={(wikipedia) => setCollectionData({ ...collectionData, wikipedia })}
            placeholder="e.g., Kind_of_Blue or a full wikipedia.org URL"
            className={undefined}
            style={{ width: '100%', padding: '0.5rem', border: '1px solid var(--color-border-strong)', borderRadius: '4px', fontSize: '1rem' }}
          />
          <small style={{ color: 'var(--color-text-muted)', fontSize: '0.875rem' }}>
            The part after wikipedia.org/wiki/. Leave blank to skip Wikipedia lookup for this collection.
          </small>
        </div>

        {/* Current image */}
        {collectionData?.image_path && (
          <div style={{ marginBottom: '1rem' }}>
            <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: '500' }}>
              Current Image
            </label>
            <img
              src={apiService.getImageUrl(collectionData.image_path, 'album_small')}
              alt="Collection cover"
              style={{ maxWidth: '200px', borderRadius: '4px', border: '1px solid var(--color-border-strong)' }}
            />
          </div>
        )}

        {/* Image download */}
        <div style={{
          padding: '1rem', backgroundColor: 'var(--color-bg-surface)',
          borderRadius: '4px', border: '1px solid var(--color-border)'
        }}>
          <h3 style={{ fontSize: '1.125rem', fontWeight: 'bold', marginBottom: '1rem' }}>
            Download Image from URL
          </h3>
          <div style={{ marginBottom: '1rem' }}>
            <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: '500' }}>Image URL</label>
            <input
              type="text"
              value={imageUrl}
              onChange={(e) => setImageUrl(e.target.value)}
              placeholder="https://example.com/image.jpg"
              style={{
                width: '100%', padding: '0.5rem', fontSize: '1rem',
                border: '1px solid var(--color-border-strong)', borderRadius: '4px',
              }}
            />
          </div>
          <div style={{ marginBottom: '1rem' }}>
            <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: '500' }}>Save as Filename</label>
            <input
              type="text"
              value={imageName}
              onChange={(e) => setImageName(e.target.value)}
              placeholder="collection_cover.jpg"
              style={{
                width: '100%', padding: '0.5rem', fontSize: '1rem',
                border: '1px solid var(--color-border-strong)', borderRadius: '4px',
              }}
            />
          </div>
          <button
            onClick={handleDownloadImage}
            disabled={downloadingImage || !imageUrl || !imageName}
            style={{
              padding: '0.5rem 1rem', backgroundColor: '#10b981', color: 'white',
              border: 'none', borderRadius: '4px', fontSize: '0.875rem',
              cursor: (downloadingImage || !imageUrl || !imageName) ? 'not-allowed' : 'pointer',
              opacity: (downloadingImage || !imageUrl || !imageName) ? 0.6 : 1,
            }}
          >
            {downloadingImage ? 'Downloading...' : 'Download & Save Image'}
          </button>
        </div>
      </div>

      {/* Add Album */}
      <div style={{ marginBottom: '1rem' }}>
        <button
          onClick={() => { setShowSearch(!showSearch); setResolvingStubId(null); }}
          style={{
            padding: '0.5rem 1rem', backgroundColor: '#10b981', color: 'white',
            border: 'none', borderRadius: '4px', cursor: 'pointer',
          }}
        >
          {showSearch ? 'Close Search' : '+ Add Album'}
        </button>
      </div>

      {showSearch && (
        <div
          ref={searchPanelRef}
          className="scroll-below-fixed-header"
          style={{
            backgroundColor: 'var(--color-bg-surface)', padding: '1.5rem', borderRadius: '0.5rem',
            marginBottom: '2rem', boxShadow: '0 1px 3px 0 rgba(0, 0, 0, 0.1)'
          }}
        >
          {resolvingStubId && (
            <div style={{
              marginBottom: '1rem', padding: '0.5rem 0.75rem', backgroundColor: '#eff6ff',
              border: '1px solid #bfdbfe', borderRadius: '4px', fontSize: '0.875rem', color: '#1e40af',
            }}>
              Resolving placeholder: <strong>{stubs.find((s) => s.id === resolvingStubId)?.title}</strong>
            </div>
          )}
          <EntitySearchPicker
            search={albumSearch}
            placeholder="Search for albums..."
            maxHeight="300px"
            renderItem={(album) => (
              <>
                <div style={{ fontWeight: '500' }}>{album.title}</div>
                <div style={{ fontSize: '0.875rem', color: 'var(--color-text-muted)' }}>{album.artist?.name}</div>
              </>
            )}
            renderAction={() => <button type="button" className="btn btn-success btn-sm">Add</button>}
            pickOnRowClick
            onPick={handleAddAlbum}
          />

          {!showStubForm ? (
            <button
              type="button"
              onClick={() => setShowStubForm(true)}
              style={{
                marginTop: '0.75rem', padding: 0, background: 'none', border: 'none',
                color: '#3b82f6', cursor: 'pointer', fontSize: '0.875rem', textDecoration: 'underline',
              }}
            >
              Can't find it? Add a placeholder instead
            </button>
          ) : (
            <div style={{ marginTop: '0.75rem', paddingTop: '0.75rem', borderTop: '1px solid var(--color-border)' }}>
              <div style={{ marginBottom: '0.5rem' }}>
                <label htmlFor="stub-title" style={{ display: 'block', fontSize: '0.875rem', fontWeight: '500', marginBottom: '0.25rem' }}>Title</label>
                <input
                  id="stub-title"
                  type="text"
                  value={stubTitle}
                  onChange={(e) => setStubTitle(e.target.value)}
                  style={{ width: '100%', boxSizing: 'border-box', padding: '0.5rem', border: '1px solid var(--color-border-strong)', borderRadius: '4px' }}
                />
              </div>
              <div style={{ marginBottom: '0.5rem' }}>
                <label htmlFor="stub-artist" style={{ display: 'block', fontSize: '0.875rem', fontWeight: '500', marginBottom: '0.25rem' }}>Artist</label>
                <input
                  id="stub-artist"
                  type="text"
                  value={stubArtistName}
                  onChange={(e) => setStubArtistName(e.target.value)}
                  style={{ width: '100%', boxSizing: 'border-box', padding: '0.5rem', border: '1px solid var(--color-border-strong)', borderRadius: '4px' }}
                />
              </div>
              <button
                type="button"
                onClick={handleAddStub}
                disabled={!stubTitle.trim()}
                style={{
                  padding: '0.5rem 1rem', backgroundColor: stubTitle.trim() ? '#10b981' : 'var(--color-border-strong)', color: 'white',
                  border: 'none', borderRadius: '4px', cursor: stubTitle.trim() ? 'pointer' : 'not-allowed',
                }}
              >
                Add Placeholder
              </button>
            </div>
          )}
        </div>
      )}

      {/* Albums list */}
      <div style={{
        backgroundColor: 'var(--color-bg-surface)', borderRadius: '0.5rem',
        boxShadow: '0 1px 3px 0 rgba(0, 0, 0, 0.1)', overflow: 'hidden'
      }}>
        <div style={{ padding: '1rem', borderBottom: '1px solid var(--color-border)', fontWeight: '600' }}>
          Albums ({albums.length}){stubs.length > 0 && `, ${formatCount(stubs.length, 'placeholder')}`}
        </div>

        {albums.length === 0 && stubs.length === 0 ? (
          <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--color-text-muted)' }}>
            No albums in this collection. Use the search above to add albums.
          </div>
        ) : (
          <ReorderableList
            items={buildMergedItems()}
            getKey={(item) => `${item.type}-${item.data.id}`}
            onReorder={persistReorder}
            menuTestId="collection-row-menu-backdrop"
            renderRow={(item, index) => (item.type === 'album' ? (
              <CollectionAlbumRowContent item={item} index={index} onRemove={handleRemoveAlbum} />
            ) : (
              <CollectionStubRowContent
                item={item}
                index={index}
                onResolve={(stubId) => { setResolvingStubId(stubId); setShowSearch(true); albumSearch.reset(); }}
                onRemove={handleRemoveStub}
              />
            ))}
          />
        )}
      </div>
    </div>
  );
}

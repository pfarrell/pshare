// src/pages/admin/album/AlbumAdditionalArtistsSection.jsx
import { useEffect, useState } from 'react';
import { apiService } from '../../../services/api';
import { getErrorMessage } from '../../../utils/errors';
import { useEntitySearch } from '../../../hooks/useEntitySearch';
import AdminPanel from '../../../components/admin/AdminPanel';
import EntitySearchPicker from '../../../components/admin/EntitySearchPicker';
import RelationList from '../../../components/admin/RelationList';

// Non-primary artist credits on an album (featured, collaborator, ...).
const AlbumAdditionalArtistsSection = ({ albumId, primaryArtistId }) => {
  const [secondaryArtists, setSecondaryArtists] = useState([]);
  const [showAddForm, setShowAddForm] = useState(false);
  const [role, setRole] = useState('featured');
  const artistSearch = useEntitySearch('artist');

  const loadSecondaryArtists = async () => {
    try {
      const response = await apiService.getAlbumSecondaryArtists(albumId);
      setSecondaryArtists(response.data);
    } catch (error) {
      console.error('Error loading secondary artists:', error);
    }
  };

  useEffect(() => {
    loadSecondaryArtists();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [albumId]);

  const closeAddForm = () => {
    setShowAddForm(false);
    artistSearch.reset();
  };

  const handleAdd = async (artist) => {
    try {
      await apiService.addArtistToAlbum(albumId, artist.id, role);
      await loadSecondaryArtists();
      closeAddForm();
    } catch (error) {
      alert(getErrorMessage(error, 'Failed to add artist'));
    }
  };

  const handleRemove = async (artistId) => {
    if (!window.confirm('Remove this artist from the album?')) return;
    try {
      await apiService.removeArtistFromAlbum(albumId, artistId);
      setSecondaryArtists((prev) => prev.filter((a) => a.artist_id !== artistId));
    } catch (error) {
      alert(getErrorMessage(error, 'Failed to remove artist'));
    }
  };

  return (
    <AdminPanel tone="relations" title="Additional Artists">
      <RelationList
        title=""
        items={secondaryArtists}
        getKey={(a) => a.artist_id}
        renderName={(a) => a.name}
        renderMeta={(a) => <span className="admin-role-pill">{a.role}</span>}
        onRemove={(a) => handleRemove(a.artist_id)}
      />

      {!showAddForm ? (
        <button type="button" className="btn btn-success-strong" onClick={() => setShowAddForm(true)}>+ Add Artist</button>
      ) : (
        <div>
          <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '0.75rem', alignItems: 'center' }}>
            <select
              value={role}
              onChange={(e) => setRole(e.target.value)}
              style={{ padding: '0.5rem', fontSize: '0.875rem', border: '1px solid var(--color-success-border)', borderRadius: '4px', backgroundColor: 'var(--color-bg-surface)' }}
            >
              <option value="featured">Featured</option>
              <option value="collaborator">Collaborator</option>
              <option value="compilation">Compilation</option>
              <option value="guest">Guest</option>
              <option value="composer">Composer</option>
              <option value="performer">Performer</option>
            </select>
            <button type="button" className="btn btn-muted" onClick={closeAddForm}>Cancel</button>
          </div>
          <EntitySearchPicker
            search={artistSearch}
            tone="relations"
            autoFocus
            placeholder="Search artist name..."
            renderItem={(artist) => (
              <span style={{ fontWeight: '500' }}>
                {artist.name}
                {artist.id === primaryArtistId && (
                  <span style={{ color: 'var(--color-text-muted)', fontWeight: 'normal', fontStyle: 'italic' }}> (current primary artist)</span>
                )}
              </span>
            )}
            renderAction={(artist) => (
              <button type="button" className="btn btn-success-strong btn-sm" onClick={() => handleAdd(artist)}>Add as {role}</button>
            )}
          />
        </div>
      )}
    </AdminPanel>
  );
};

export default AlbumAdditionalArtistsSection;

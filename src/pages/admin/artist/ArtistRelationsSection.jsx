// src/pages/admin/artist/ArtistRelationsSection.jsx
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import { apiService } from '../../../services/api';
import { getErrorMessage } from '../../../utils/errors';
import { formatCount } from '../../../utils/formatters';
import { useEntitySearch } from '../../../hooks/useEntitySearch';
import AdminPanel from '../../../components/admin/AdminPanel';
import EntitySearchPicker from '../../../components/admin/EntitySearchPicker';
import RelationList from '../../../components/admin/RelationList';

const RELATION_TYPE_LABELS = {
  member_of: 'Member Of',
  member: 'Member',
  similar_artist: 'Similar Artist',
  related_artist: 'Related Artist',
};

// Relation types whose add-form search looks up artists; the rest look up albums.
const ARTIST_SEARCH_TYPES = ['related_artist', 'member', 'member_of', 'similar_artist'];

const selectStyle = {
  padding: '0.5rem', fontSize: '0.875rem', border: '1px solid var(--color-success-border)',
  borderRadius: '4px', backgroundColor: 'var(--color-bg-surface)',
};

const ArtistRelationsSection = ({ artistId, reloadKey = 0 }) => {
  const navigate = useNavigate();
  const [relatedArtists, setRelatedArtists] = useState([]);
  const [appearsOnAlbums, setAppearsOnAlbums] = useState([]);
  const [showHiddenRelations, setShowHiddenRelations] = useState(false);
  const [showAddForm, setShowAddForm] = useState(false);
  const [relationType, setRelationType] = useState('related_artist');
  const [appearsOnRole, setAppearsOnRole] = useState('featured');
  const searchesArtists = ARTIST_SEARCH_TYPES.includes(relationType);
  const addSearch = useEntitySearch(searchesArtists ? 'artist-admin' : 'album');

  const loadRelatedArtists = async () => {
    try {
      const response = await apiService.getRelatedArtists(artistId);
      setRelatedArtists(response.data);
    } catch (error) {
      console.error('Error loading related artists:', error);
    }
  };

  const loadAppearsOn = async () => {
    try {
      const response = await apiService.getArtistSecondaryAlbums(artistId);
      setAppearsOnAlbums(response.data);
    } catch (error) {
      console.error('Error loading appears-on albums:', error);
    }
  };

  useEffect(() => {
    loadRelatedArtists();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [artistId, reloadKey]);

  useEffect(() => {
    loadAppearsOn();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [artistId]);

  const closeAddForm = () => {
    setShowAddForm(false);
    addSearch.reset();
  };

  // Every add here already persists immediately on the server — there's no
  // separate "save the artist" step for relations. An explicit toast per
  // outcome is what distinguishes a successful add from a silent failure.
  const handleAddRelation = async (item) => {
    try {
      if (relationType === 'member_of') {
        // Reverse direction from the plain 'member' case: this artist is the
        // member, item is the band/parent — write artist_id=item.id,
        // related_artist_id=artistId so it lands correctly regardless of
        // which artist's admin page you're on.
        await apiService.addRelatedArtist(item.id, artistId, 'member');
        await loadRelatedArtists();
        toast.success(`Added "${item.name}" as ${RELATION_TYPE_LABELS[relationType]}`);
      } else if (relationType === 'related_artist' || relationType === 'member' || relationType === 'similar_artist') {
        const kind = relationType === 'member' ? 'member' : relationType === 'similar_artist' ? 'similar' : 'related';
        await apiService.addRelatedArtist(artistId, item.id, kind);
        await loadRelatedArtists();
        toast.success(`Added "${item.name}" as ${RELATION_TYPE_LABELS[relationType]}`);
      } else {
        await apiService.addAlbumToArtist(artistId, item.id, appearsOnRole);
        await loadAppearsOn();
        toast.success(`Added "${item.title}" to Appears On`);
      }
      closeAddForm();
    } catch (error) {
      toast.error(getErrorMessage(error, 'Failed to add relation'));
    }
  };

  // kind must be passed through (not inferred server-side) — a pair can hold
  // more than one relation kind at once (e.g. 'similar' alongside 'member').
  const handleRemoveRelatedArtist = async (relatedArtistId, kind) => {
    if (!window.confirm('Remove this related artist?')) return;
    try {
      await apiService.removeRelatedArtist(artistId, relatedArtistId, kind);
      setRelatedArtists((prev) => prev.filter((ra) => !(ra.id === relatedArtistId && ra.kind === kind)));
    } catch (error) {
      alert(getErrorMessage(error, 'Failed to remove related artist'));
    }
  };

  // "Member Of" rows are stored in the opposite direction (artist_id = the
  // other artist, related_artist_id = this one) — removal must target that
  // same direction. Always kind='member'.
  const handleRemoveMemberOf = async (otherArtistId) => {
    if (!window.confirm('Remove this "member of" relationship?')) return;
    try {
      await apiService.removeRelatedArtist(otherArtistId, artistId, 'member');
      setRelatedArtists((prev) => prev.filter((ra) => !(ra.id === otherArtistId && ra.kind === 'member_of')));
    } catch (error) {
      alert(getErrorMessage(error, 'Failed to remove relationship'));
    }
  };

  const handleToggleHideRelation = async (relatedArtistId, currentlyHidden) => {
    try {
      await apiService.hideArtistRelation(artistId, relatedArtistId, !currentlyHidden);
      setRelatedArtists((prev) => prev.map((ra) => (ra.id === relatedArtistId ? { ...ra, is_hidden: !currentlyHidden } : ra)));
    } catch (error) {
      alert(getErrorMessage(error, 'Failed to update relation'));
    }
  };

  const handleToggleForceShow = async (relatedArtistId, currentForceShow) => {
    try {
      await apiService.forceShowArtistRelation(artistId, relatedArtistId, !currentForceShow);
      setRelatedArtists((prev) => prev.map((ra) => (ra.id === relatedArtistId ? { ...ra, force_show: !currentForceShow } : ra)));
    } catch (error) {
      alert(getErrorMessage(error, 'Failed to update relation'));
    }
  };

  const handleRemoveAlbumFromArtist = async (albumId) => {
    if (!window.confirm('Remove this album relationship?')) return;
    try {
      await apiService.removeAlbumFromArtist(artistId, albumId);
      setAppearsOnAlbums((prev) => prev.filter((a) => a.album_id !== albumId));
    } catch (error) {
      alert(getErrorMessage(error, 'Failed to remove album'));
    }
  };

  const allSimilar = relatedArtists.filter((r) => r.kind === 'similar');
  const visibleSimilar = showHiddenRelations ? allSimilar : allSimilar.filter((r) => !r.is_hidden);
  const hiddenCount = allSimilar.filter((r) => r.is_hidden).length;
  const byKind = (kind) => relatedArtists.filter((r) => r.kind === kind);
  const artistLink = (ra) => (
    <span className="admin-relation-link" onClick={() => navigate(`/artist/${ra.id}`)}>{ra.name}</span>
  );

  return (
    <AdminPanel
      tone="relations"
      title="Relations"
      actions={!showAddForm && (
        <button type="button" className="btn btn-success-strong" onClick={() => setShowAddForm(true)}>+ Add Relation</button>
      )}
    >
      {showAddForm && (
        <div>
          <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '0.5rem', alignItems: 'center', flexWrap: 'wrap' }}>
            <select
              value={relationType}
              onChange={(e) => { setRelationType(e.target.value); addSearch.reset(); }}
              style={selectStyle}
            >
              <option value="similar_artist">Similar Artist (Manual)</option>
              <option value="related_artist">Related Artist</option>
              <option value="member">Member</option>
              <option value="member_of">Member Of</option>
              <option value="appears_on">Appears On Album</option>
            </select>
            {relationType === 'appears_on' && (
              <select value={appearsOnRole} onChange={(e) => setAppearsOnRole(e.target.value)} style={selectStyle}>
                <option value="featured">Featured</option>
                <option value="collaborator">Collaborator</option>
                <option value="compilation">Compilation</option>
                <option value="guest">Guest</option>
              </select>
            )}
            <button type="button" className="btn btn-muted" onClick={closeAddForm}>Cancel</button>
          </div>
          <EntitySearchPicker
            search={addSearch}
            tone="relations"
            autoFocus
            placeholder={relationType === 'appears_on' ? 'Search album title...' : 'Search artist name...'}
            renderItem={(item) => (
              <>
                <span style={{ fontWeight: '500' }}>{item.name || item.title}</span>
                {String(item.id) === String(artistId) && (
                  <span style={{ fontSize: '0.8rem', color: 'var(--color-text-muted)', fontStyle: 'italic', marginLeft: '0.5rem' }}>(this artist)</span>
                )}
                {item.artist && <span style={{ fontSize: '0.8rem', color: 'var(--color-text-muted)', marginLeft: '0.5rem' }}>by {item.artist.name}</span>}
                {searchesArtists && (
                  <span style={{ fontSize: '0.8rem', color: 'var(--color-text-muted)', marginLeft: '0.5rem' }}>
                    {formatCount(Number(item.album_count), 'album')} · ID {item.id}
                  </span>
                )}
              </>
            )}
            renderAction={(item) => (
              <button type="button" className="btn btn-success-strong btn-sm" onClick={() => handleAddRelation(item)}>Add</button>
            )}
          />
          <hr style={{ border: 'none', borderTop: '1px solid var(--color-success-border)', margin: '0 0 0.75rem 0' }} />
        </div>
      )}

      <div style={{ maxHeight: '400px', overflowY: 'auto' }}>
        {allSimilar.length > 0 && (
          <RelationList
            title="Similar Artists"
            titleExtra={hiddenCount > 0 && (
              <button
                type="button"
                onClick={() => setShowHiddenRelations((v) => !v)}
                style={{ fontSize: '0.65rem', padding: '0.1rem 0.4rem', backgroundColor: 'var(--color-text-secondary)', borderRadius: '9999px', color: 'var(--color-text-faint)', border: 'none', cursor: 'pointer', textTransform: 'none', letterSpacing: 0 }}
              >
                {showHiddenRelations ? `hide ${hiddenCount} hidden` : `show ${hiddenCount} hidden`}
              </button>
            )}
            items={visibleSimilar}
            rowStyle={(ra) => ({ opacity: ra.is_hidden ? 0.45 : 1 })}
            renderName={(ra) => (
              <span
                className={ra.is_hidden ? undefined : 'admin-relation-link'}
                style={ra.is_hidden ? { color: 'var(--color-text-faint)', textDecoration: 'line-through', cursor: 'pointer' } : undefined}
                onClick={() => navigate(`/artist/${ra.id}`)}
              >
                {ra.name}
                {ra.similarity != null && <span style={{ fontSize: '0.65rem', color: 'var(--color-text-muted)', marginLeft: '0.4rem' }}>{(ra.similarity * 100).toFixed(0)}%</span>}
                {ra.source !== 'manual' && <span style={{ fontSize: '0.65rem', color: 'var(--color-text-secondary)', marginLeft: '0.3rem' }}>({ra.source})</span>}
              </span>
            )}
            rowActions={(ra) => (
              <>
                <button
                  type="button"
                  className="btn btn-sm"
                  onClick={() => handleToggleForceShow(ra.id, ra.force_show)}
                  title={ra.force_show ? 'Unpin (remove force-show)' : 'Pin (always include in similar artists)'}
                  style={{ backgroundColor: ra.force_show ? 'var(--color-link-accent)' : 'var(--color-text-secondary)', color: ra.force_show ? 'white' : 'var(--color-bg-surface)' }}
                >
                  {ra.force_show ? 'Pinned' : 'Pin'}
                </button>
                <button
                  type="button"
                  className="btn btn-sm"
                  onClick={() => handleToggleHideRelation(ra.id, ra.is_hidden)}
                  style={{ backgroundColor: ra.is_hidden ? 'var(--color-text-secondary)' : 'var(--color-text-muted)', color: 'var(--color-bg-surface)' }}
                >
                  {ra.is_hidden ? 'Unhide' : 'Hide'}
                </button>
                {ra.source === 'manual' && (
                  <button type="button" className="btn btn-danger btn-sm" onClick={() => handleRemoveRelatedArtist(ra.id, ra.kind)}>Remove</button>
                )}
              </>
            )}
          />
        )}
        <RelationList title="Members" items={byKind('member')} renderName={artistLink} onRemove={(ra) => handleRemoveRelatedArtist(ra.id, ra.kind)} />
        <RelationList title="Member Of" items={byKind('member_of')} renderName={artistLink} onRemove={(ra) => handleRemoveMemberOf(ra.id)} />
        <RelationList title="Related Artists" items={byKind('related')} renderName={artistLink} onRemove={(ra) => handleRemoveRelatedArtist(ra.id, ra.kind)} />
        <RelationList
          title="Appears On"
          items={appearsOnAlbums}
          getKey={(a) => a.album_id}
          renderName={(a) => (
            <>
              <span className="admin-relation-link" onClick={() => navigate(`/album/${a.album_id}`)}>{a.title}</span>
              {a.release_year && <span style={{ fontWeight: 'normal', color: 'var(--color-text-muted)', marginLeft: '0.5rem' }}>({a.release_year})</span>}
            </>
          )}
          renderMeta={(a) => <span className="admin-role-pill">{a.role}</span>}
          onRemove={(a) => handleRemoveAlbumFromArtist(a.album_id)}
        />
      </div>
    </AdminPanel>
  );
};

export default ArtistRelationsSection;

// src/pages/admin/artist/ArtistMergeSection.jsx
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import { apiService } from '../../../services/api';
import { formatCount } from '../../../utils/formatters';
import { getErrorMessage } from '../../../utils/errors';
import { useEntitySearch } from '../../../hooks/useEntitySearch';
import AdminPanel from '../../../components/admin/AdminPanel';
import EntitySearchPicker from '../../../components/admin/EntitySearchPicker';

// Fix duplicate/misspelled artists: merge suggested near-duplicates into this
// artist, or pick any other artist and choose which of the two survives.
const ArtistMergeSection = ({ artistId, artistName, ownAlbumCount, onMergedKeepingThis, onError }) => {
  const navigate = useNavigate();
  const [suggestedDuplicates, setSuggestedDuplicates] = useState(null); // null = not fetched, [] = none found
  const [loadingSuggestions, setLoadingSuggestions] = useState(false);
  const [selectedSuggestionIds, setSelectedSuggestionIds] = useState(new Set());
  const [mergingSuggestions, setMergingSuggestions] = useState(false);
  const [selectedMergeTarget, setSelectedMergeTarget] = useState(null);
  const [keepThisArtist, setKeepThisArtist] = useState(true);
  const [merging, setMerging] = useState(false);
  const mergeSearch = useEntitySearch('artist-admin', {
    filterResults: (rows) => rows.filter((a) => String(a.id) !== String(artistId)),
  });

  const hideSuggestions = () => {
    setSuggestedDuplicates(null);
    setSelectedSuggestionIds(new Set());
  };

  const handleSuggestDuplicates = async () => {
    setLoadingSuggestions(true);
    try {
      const res = await apiService.previewArtistStubs(artistId);
      setSuggestedDuplicates(res.data);
      setSelectedSuggestionIds(new Set(res.data.map((s) => s.id)));
      mergeSearch.reset();
      setSelectedMergeTarget(null);
    } catch (error) {
      toast.error(getErrorMessage(error, 'Failed to load candidates'));
    } finally {
      setLoadingSuggestions(false);
    }
  };

  const handleMergeSuggestions = async () => {
    if (selectedSuggestionIds.size === 0) return;
    setMergingSuggestions(true);
    try {
      await apiService.mergeArtists(artistId, [...selectedSuggestionIds]);
      toast.success(`Merged ${selectedSuggestionIds.size} artist(s) into "${artistName}"`);
      hideSuggestions();
      onMergedKeepingThis();
    } catch (error) {
      toast.error(getErrorMessage(error, 'Failed to merge'));
    } finally {
      setMergingSuggestions(false);
    }
  };

  const handleSelectMergeTarget = (artist) => {
    setSelectedMergeTarget(artist);
    mergeSearch.setResults([]);
    setKeepThisArtist(ownAlbumCount >= Number(artist.album_count ?? 0));
  };

  const handleMerge = async () => {
    if (!selectedMergeTarget) return;
    const survivorId = keepThisArtist ? artistId : selectedMergeTarget.id;
    const survivorName = keepThisArtist ? artistName : selectedMergeTarget.name;
    const loserId = keepThisArtist ? selectedMergeTarget.id : artistId;
    const loserName = keepThisArtist ? selectedMergeTarget.name : artistName;

    if (!window.confirm(`This will delete "${loserName}" and move all its albums, tracks, and credits to "${survivorName}". This cannot be undone.`)) return;

    setMerging(true);
    onError(null);
    try {
      await apiService.mergeArtists(survivorId, [loserId]);
      toast.success(`Merged "${loserName}" into "${survivorName}".`);
      if (keepThisArtist) {
        setSelectedMergeTarget(null);
        mergeSearch.reset();
        onMergedKeepingThis();
      } else {
        navigate(`/artist/${survivorId}`);
      }
    } catch (error) {
      console.error('Error merging artists:', error);
      onError(getErrorMessage(error, 'Failed to merge'));
    } finally {
      setMerging(false);
    }
  };

  const handleCreateAndMerge = async () => {
    const newName = mergeSearch.query.trim();
    if (!newName) return;
    if (!window.confirm(`Create a new artist "${newName}" and merge "${artistName}" into it? This will delete "${artistName}" and move all its albums, tracks, and credits to the new artist. This cannot be undone.`)) return;

    setMerging(true);
    onError(null);
    try {
      const createResponse = await apiService.createArtist(newName);
      const newArtistId = createResponse.data.id;
      await apiService.mergeArtists(newArtistId, [artistId]);
      toast.success(`Created "${newName}" and merged "${artistName}" into it.`);
      navigate(`/artist/${newArtistId}`);
    } catch (error) {
      console.error('Error creating and merging:', error);
      onError(getErrorMessage(error, 'Failed to create and merge'));
    } finally {
      setMerging(false);
    }
  };

  return (
    <AdminPanel tone="warning" title="Merge With Another Artist">
      <p style={{ marginBottom: '1rem', color: 'var(--color-warning-text)', fontSize: '0.875rem' }}>
        Use this to fix duplicate or misspelled artists (e.g. from bad ID3 tags). One artist is always deleted; its albums, tracks, and credits move to the other.
      </p>

      <button
        type="button"
        className="btn btn-muted"
        onClick={suggestedDuplicates !== null ? hideSuggestions : handleSuggestDuplicates}
        disabled={loadingSuggestions}
        style={{ marginBottom: '1rem' }}
      >
        {loadingSuggestions ? 'Loading...' : suggestedDuplicates !== null ? 'Hide suggestions' : 'Suggest possible duplicates'}
      </button>

      {suggestedDuplicates !== null && (
        <div style={{ backgroundColor: 'var(--color-bg-surface)', border: '1px solid var(--color-warning-border)', borderRadius: '6px', padding: '0.75rem', marginBottom: '1rem', color: 'var(--color-text-primary)' }}>
          {suggestedDuplicates.length === 0 ? (
            <p style={{ color: 'var(--color-text-muted)', fontSize: '0.875rem', margin: 0 }}>No matching duplicates found.</p>
          ) : (
            <>
              <div style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)', marginBottom: '0.5rem' }}>
                Select artists to merge into "{artistName}":
              </div>
              {suggestedDuplicates.map((stub) => (
                <label key={stub.id} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.3rem 0', cursor: 'pointer', fontSize: '0.875rem' }}>
                  <input
                    type="checkbox"
                    checked={selectedSuggestionIds.has(stub.id)}
                    onChange={(e) => {
                      const next = new Set(selectedSuggestionIds);
                      if (e.target.checked) next.add(stub.id);
                      else next.delete(stub.id);
                      setSelectedSuggestionIds(next);
                    }}
                  />
                  <span style={{ flex: 1, minWidth: 0 }}>{stub.name}</span>
                  <span style={{ color: 'var(--color-text-muted)', fontSize: '0.7rem' }}>{formatCount(Number(stub.album_count), 'album')}</span>
                  <span style={{ color: 'var(--color-text-faint)', fontSize: '0.75rem' }}>{(stub.similarity * 100).toFixed(0)}%</span>
                </label>
              ))}
              <button
                type="button"
                className="btn btn-primary"
                onClick={handleMergeSuggestions}
                disabled={mergingSuggestions || selectedSuggestionIds.size === 0}
                style={{ marginTop: '0.5rem', width: '100%' }}
              >
                {mergingSuggestions ? 'Merging...' : `Merge ${selectedSuggestionIds.size} selected into "${artistName}"`}
              </button>
            </>
          )}
        </div>
      )}

      <EntitySearchPicker
        search={mergeSearch}
        tone="warning"
        placeholder="Search for another artist..."
        submitClassName="btn btn-muted"
        maxHeight="200px"
        onSubmit={hideSuggestions}
        onQueryChange={() => { setSelectedMergeTarget(null); mergeSearch.clearResults(); }}
        renderItem={(artist) => <span style={{ fontWeight: '500' }}>{artist.name}</span>}
        renderAction={(artist) => (
          <span style={{ fontSize: '0.8rem', color: 'var(--color-text-muted)' }}>{formatCount(Number(artist.album_count), 'album')} · ID {artist.id}</span>
        )}
        pickOnRowClick
        onPick={handleSelectMergeTarget}
        emptyAction={!selectedMergeTarget && (
          <button type="button" className="btn btn-primary" onClick={handleCreateAndMerge} disabled={merging} style={{ marginBottom: '1rem' }}>
            {merging ? 'Creating...' : `Create "${mergeSearch.query.trim()}" & merge this artist into it`}
          </button>
        )}
      />

      {selectedMergeTarget && (
        <div style={{ marginBottom: '1rem' }}>
          <p style={{ color: 'var(--color-warning-text)', fontSize: '0.875rem', marginBottom: '0.5rem' }}>
            Target: <strong>{selectedMergeTarget.name}</strong>
            <button
              type="button"
              onClick={() => { setSelectedMergeTarget(null); mergeSearch.setQuery(''); }}
              style={{ marginLeft: '0.5rem', background: 'none', border: 'none', color: 'var(--color-text-muted)', cursor: 'pointer', fontSize: '0.875rem' }}
            >
              ✕
            </button>
          </p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem', marginBottom: '0.75rem', fontSize: '0.875rem', color: 'var(--color-warning-text)' }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', cursor: 'pointer' }}>
              <input type="radio" checked={keepThisArtist} onChange={() => setKeepThisArtist(true)} />
              Keep this artist ("{artistName}") — delete "{selectedMergeTarget.name}"
            </label>
            <label style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', cursor: 'pointer' }}>
              <input type="radio" checked={!keepThisArtist} onChange={() => setKeepThisArtist(false)} />
              Keep "{selectedMergeTarget.name}" — delete this artist ("{artistName}")
            </label>
          </div>
          <button type="button" className="btn btn-warning btn-lg" onClick={handleMerge} disabled={merging}>
            {merging ? 'Merging...' : 'Merge'}
          </button>
        </div>
      )}
    </AdminPanel>
  );
};

export default ArtistMergeSection;

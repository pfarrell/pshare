// src/pages/AdminArtist.jsx
import { useCallback, useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { apiService } from '../services/api';
import { useUnsavedChangesStore } from '../stores/unsavedChangesStore';
import Loading from '../components/Loading';
import ConfirmDeleteModal from '../components/ConfirmDeleteModal';
import TagsSection from '../components/TagsSection';
import MusicBrainzPicker from '../components/MusicBrainzPicker';
import { parseWikipediaSlug } from '../utils/wikipediaSlug';
import { toFilename } from '../utils/filenames';
import { formatCount } from '../utils/formatters';
import toast from 'react-hot-toast';

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

  // Image gallery state
  const [images, setImages] = useState([]);
  const [newImageUrl, setNewImageUrl] = useState('');
  const [newImageName, setNewImageName] = useState('');
  const [addingImage, setAddingImage] = useState(false);

  // Merge with another artist state
  const [ownAlbumCount, setOwnAlbumCount] = useState(0);
  const [ownTrackCount, setOwnTrackCount] = useState(0);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [suggestedDuplicates, setSuggestedDuplicates] = useState(null); // null = not fetched, [] = none found
  const [loadingSuggestions, setLoadingSuggestions] = useState(false);
  const [selectedSuggestionIds, setSelectedSuggestionIds] = useState(new Set());
  const [mergingSuggestions, setMergingSuggestions] = useState(false);
  const [mergeQuery, setMergeQuery] = useState('');
  const [mergeResults, setMergeResults] = useState([]);
  const [mergeSearching, setMergeSearching] = useState(false);
  const [hasSearchedMerge, setHasSearchedMerge] = useState(false);
  const [selectedMergeTarget, setSelectedMergeTarget] = useState(null);
  const [keepThisArtist, setKeepThisArtist] = useState(true);
  const [merging, setMerging] = useState(false);

  // Related artists state
  const [relatedArtists, setRelatedArtists] = useState([]);
  const [showHiddenRelations, setShowHiddenRelations] = useState(false);

  // Unified relations add form state
  const [showAddRelationSection, setShowAddRelationSection] = useState(false);
  const [relationTypeToAdd, setRelationTypeToAdd] = useState('related_artist');
  const [addRelationQuery, setAddRelationQuery] = useState('');
  const [addRelationResults, setAddRelationResults] = useState([]);
  const [addRelationSearching, setAddRelationSearching] = useState(false);
  const [addRelationRole, setAddRelationRole] = useState('featured');

  // Appears On (non-primary albums) state
  const [appearsOnAlbums, setAppearsOnAlbums] = useState([]);

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
        setNewImageName(toFilename(artist.name || '') + '.jpg');
        setWikipedia(artist.wikipedia || '');
        setMusicbrainzId(artist.musicbrainz_id || '');
        setMbidStatus(artist.mbid_status || '');
        const imagesRes = await apiService.getArtistImages(id);
        setImages(imagesRes.data);
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

  useEffect(() => {
    const loadAppearsOn = async () => {
      try {
        const response = await apiService.getArtistSecondaryAlbums(id);
        setAppearsOnAlbums(response.data);
      } catch (error) {
        console.error('Error loading appears-on albums:', error);
      }
    };
    if (id) loadAppearsOn();
  }, [id]);

  useEffect(() => {
    const loadRelatedArtists = async () => {
      try {
        const response = await apiService.getRelatedArtists(id);
        setRelatedArtists(response.data);
      } catch (error) {
        console.error('Error loading related artists:', error);
      }
    };
    if (id) loadRelatedArtists();
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
  const saveArtist = useCallback(async () => {
    await apiService.updateArtist(id, {
      name,
      image_path: imagePath,
      wikipedia,
      musicbrainz_id: musicbrainzId,
    });
    setHasUnsavedChanges(false);
  }, [id, name, imagePath, wikipedia, musicbrainzId]);

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
          await saveArtist();
          // Navigate to the link destination
          setTimeout(() => navigate(href), 0);
        } catch (error) {
          console.error('Error saving artist:', error);
          setError(error.response?.data?.error || 'Failed to save artist');
        }
      }
    };

    // Add click listener to the document
    document.addEventListener('click', handleClick, true);
    return () => document.removeEventListener('click', handleClick, true);
  }, [hasUnsavedChanges, saveArtist, navigate]);

  useEffect(() => {
    useUnsavedChangesStore.getState().setUnsavedChanges(hasUnsavedChanges, saveArtist);
    return () => useUnsavedChangesStore.getState().clear();
  }, [hasUnsavedChanges, saveArtist]);

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

  const handleSuggestDuplicates = async () => {
    setLoadingSuggestions(true);
    try {
      const res = await apiService.previewArtistStubs(id);
      setSuggestedDuplicates(res.data);
      setSelectedSuggestionIds(new Set(res.data.map(s => s.id)));
      setMergeQuery('');
      setMergeResults([]);
      setHasSearchedMerge(false);
      setSelectedMergeTarget(null);
    } catch (error) {
      toast.error(error.response?.data?.error || 'Failed to load candidates');
    } finally {
      setLoadingSuggestions(false);
    }
  };

  const handleMergeSuggestions = async () => {
    if (selectedSuggestionIds.size === 0) return;
    setMergingSuggestions(true);
    try {
      await apiService.mergeArtists(id, [...selectedSuggestionIds]);
      toast.success(`Merged ${selectedSuggestionIds.size} artist(s) into "${artistData.name}"`);
      setSuggestedDuplicates(null);
      setSelectedSuggestionIds(new Set());
      const response = await apiService.getRelatedArtists(id);
      setRelatedArtists(response.data);
    } catch (error) {
      toast.error(error.response?.data?.error || 'Failed to merge');
    } finally {
      setMergingSuggestions(false);
    }
  };

  const handleMergeSearch = async (e) => {
    e.preventDefault();
    if (mergeQuery.length < 2) return;
    setMergeSearching(true);
    try {
      const response = await apiService.searchAdminArtists(mergeQuery);
      setMergeResults((response.data || []).filter(a => String(a.id) !== String(id)));
      setHasSearchedMerge(true);
      setSuggestedDuplicates(null);
      setSelectedSuggestionIds(new Set());
    } catch (error) {
      console.error('Error searching artists:', error);
    } finally {
      setMergeSearching(false);
    }
  };

  const handleSelectMergeTarget = (artist) => {
    setSelectedMergeTarget(artist);
    setMergeResults([]);
    setKeepThisArtist(ownAlbumCount >= (artist.album_count ?? 0));
  };

  const handleMerge = async () => {
    if (!selectedMergeTarget) return;
    const survivorId = keepThisArtist ? id : selectedMergeTarget.id;
    const survivorName = keepThisArtist ? artistData.name : selectedMergeTarget.name;
    const loserId = keepThisArtist ? selectedMergeTarget.id : id;
    const loserName = keepThisArtist ? selectedMergeTarget.name : artistData.name;

    const confirmed = window.confirm(
      `This will delete "${loserName}" and move all its albums, tracks, and credits to "${survivorName}". This cannot be undone.`
    );
    if (!confirmed) return;

    setMerging(true);
    setError(null);
    try {
      await apiService.mergeArtists(survivorId, [loserId]);
      toast.success(`Merged "${loserName}" into "${survivorName}".`);
      if (keepThisArtist) {
        setSelectedMergeTarget(null);
        setMergeQuery('');
        setHasSearchedMerge(false);
        const response = await apiService.getRelatedArtists(id);
        setRelatedArtists(response.data);
      } else {
        navigate(`/artist/${survivorId}`);
      }
    } catch (error) {
      console.error('Error merging artists:', error);
      setError(error.response?.data?.error || 'Failed to merge');
    } finally {
      setMerging(false);
    }
  };

  const handleCreateAndMerge = async () => {
    const newName = mergeQuery.trim();
    if (!newName) return;

    const confirmed = window.confirm(
      `Create a new artist "${newName}" and merge "${artistData.name}" into it? This will delete "${artistData.name}" and move all its albums, tracks, and credits to the new artist. This cannot be undone.`
    );
    if (!confirmed) return;

    setMerging(true);
    setError(null);
    try {
      const createResponse = await apiService.createArtist(newName);
      const newArtistId = createResponse.data.id;
      await apiService.mergeArtists(newArtistId, [id]);
      toast.success(`Created "${newName}" and merged "${artistData.name}" into it.`);
      navigate(`/artist/${newArtistId}`);
    } catch (error) {
      console.error('Error creating and merging:', error);
      setError(error.response?.data?.error || 'Failed to create and merge');
    } finally {
      setMerging(false);
    }
  };

  const handleDelete = () => {
    setShowDeleteModal(true);
  };

  const confirmDelete = async () => {
    await apiService.deleteArtist(id);
    navigate('/');
  };

  const handleNavigateAway = async (destination) => {
    if (hasUnsavedChanges) {
      const choice = window.confirm('You have unsaved changes. Click OK to save and leave, or Cancel to stay on this page.');

      if (choice) {
        // User clicked OK - save and navigate
        try {
          await apiService.updateArtist(id, {
            name,
            image_path: imagePath,
            wikipedia,
            musicbrainz_id: musicbrainzId,
          });
          setHasUnsavedChanges(false);
          navigate(destination);
        } catch (error) {
          console.error('Error saving artist:', error);
          setError(error.response?.data?.error || 'Failed to save artist');
        }
      }
      // If Cancel, do nothing (stay on page)
    } else {
      // No unsaved changes, just navigate
      navigate(destination);
    }
  };

  const handleCancel = () => {
    handleNavigateAway(`/artist/${id}`);
  };

  const handleNavigateBack = (e) => {
    e.preventDefault();
    handleNavigateAway(`/artist/${id}`);
  };

  const handleRemoveAlbumFromArtist = async (albumId) => {
    if (!window.confirm('Remove this album relationship?')) return;
    try {
      await apiService.removeAlbumFromArtist(id, albumId);
      setAppearsOnAlbums(prev => prev.filter(a => a.album_id !== albumId));
    } catch (error) {
      alert(error.response?.data?.error || 'Failed to remove album');
    }
  };

  const handleAddRelationSearch = async (e) => {
    e.preventDefault();
    if (addRelationQuery.length < 2) return;
    setAddRelationSearching(true);
    try {
      if (relationTypeToAdd === 'related_artist' || relationTypeToAdd === 'member' || relationTypeToAdd === 'member_of') {
        const response = await apiService.searchAdminArtists(addRelationQuery);
        setAddRelationResults(response.data || []);
      } else {
        const response = await apiService.search(addRelationQuery);
        setAddRelationResults((response.data.results || []).filter(r => r.type === 'album').map(r => r.data));
      }
    } catch (error) {
      console.error('Search failed:', error);
    } finally {
      setAddRelationSearching(false);
    }
  };

  const RELATION_TYPE_LABELS = {
    member_of: 'Member Of',
    member: 'Member',
    similar_artist: 'Similar Artist',
    related_artist: 'Related Artist',
  };

  // Every add here already persists immediately on the server — there's no
  // separate "save the artist" step for relations. The only reason this
  // ever looked like it needed one is that a successful add and a silent
  // failure previously looked identical (list just quietly re-rendered
  // either way) — an explicit toast per outcome closes that gap.
  const handleAddRelation = async (item) => {
    try {
      if (relationTypeToAdd === 'member_of') {
        // Reverse direction from the plain 'member' case: this artist is
        // the member, item is the band/parent — write artist_id=item.id,
        // related_artist_id=id so it lands correctly regardless of which
        // artist's admin page you're on, rather than requiring a trip to
        // the parent artist's page to add it from the other side.
        await apiService.addRelatedArtist(item.id, id, 'member');
        const response = await apiService.getRelatedArtists(id);
        setRelatedArtists(response.data);
        toast.success(`Added "${item.name}" as ${RELATION_TYPE_LABELS[relationTypeToAdd]}`);
      } else if (relationTypeToAdd === 'related_artist' || relationTypeToAdd === 'member' || relationTypeToAdd === 'similar_artist') {
        const kind = relationTypeToAdd === 'member' ? 'member' : relationTypeToAdd === 'similar_artist' ? 'similar' : 'related';
        await apiService.addRelatedArtist(id, item.id, kind);
        const response = await apiService.getRelatedArtists(id);
        setRelatedArtists(response.data);
        toast.success(`Added "${item.name}" as ${RELATION_TYPE_LABELS[relationTypeToAdd]}`);
      } else {
        await apiService.addAlbumToArtist(id, item.id, addRelationRole);
        const response = await apiService.getArtistSecondaryAlbums(id);
        setAppearsOnAlbums(response.data);
        toast.success(`Added "${item.title}" to Appears On`);
      }
      setAddRelationResults([]);
      setAddRelationQuery('');
      setShowAddRelationSection(false);
    } catch (error) {
      toast.error(error.response?.data?.error || 'Failed to add relation');
    }
  };

  // kind must be passed through (not inferred server-side) — a pair can now
  // hold more than one relation kind at once (e.g. 'similar' alongside
  // 'member'), so the backend needs to know exactly which one to remove.
  const handleRemoveRelatedArtist = async (relatedArtistId, kind) => {
    if (!window.confirm('Remove this related artist?')) return;
    try {
      await apiService.removeRelatedArtist(id, relatedArtistId, kind);
      setRelatedArtists(prev => prev.filter(ra => !(ra.id === relatedArtistId && ra.kind === kind)));
    } catch (error) {
      alert(error.response?.data?.error || 'Failed to remove related artist');
    }
  };

  // "Member Of" rows are stored in the opposite direction from every other
  // relation on this page (artist_id = the other artist, related_artist_id
  // = this one) — removal must target that same direction, not the usual
  // (id, otherArtistId) pair the other sections use. Always kind='member'.
  const handleRemoveMemberOf = async (otherArtistId) => {
    if (!window.confirm('Remove this "member of" relationship?')) return;
    try {
      await apiService.removeRelatedArtist(otherArtistId, id, 'member');
      setRelatedArtists(prev => prev.filter(ra => !(ra.id === otherArtistId && ra.kind === 'member_of')));
    } catch (error) {
      alert(error.response?.data?.error || 'Failed to remove relationship');
    }
  };

  const handleToggleHideRelation = async (relatedArtistId, currentlyHidden) => {
    try {
      await apiService.hideArtistRelation(id, relatedArtistId, !currentlyHidden);
      setRelatedArtists(prev => prev.map(ra =>
        ra.id === relatedArtistId ? { ...ra, is_hidden: !currentlyHidden } : ra
      ));
    } catch (error) {
      alert(error.response?.data?.error || 'Failed to update relation');
    }
  };

  const handleToggleForceShow = async (relatedArtistId, currentForceShow) => {
    try {
      await apiService.forceShowArtistRelation(id, relatedArtistId, !currentForceShow);
      setRelatedArtists(prev => prev.map(ra =>
        ra.id === relatedArtistId ? { ...ra, force_show: !currentForceShow } : ra
      ));
    } catch (error) {
      alert(error.response?.data?.error || 'Failed to update relation');
    }
  };

  if (loading) {
    return <Loading message="Loading artist" />;
  }

  if (error && !artistData) {
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
            Name *
          </label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
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
          <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 'bold' }}>
            Image Path
          </label>
          <input
            type="text"
            value={imagePath}
            onChange={(e) => setImagePath(e.target.value)}
            placeholder="e.g., beatles.jpg"
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
              src={apiService.getImageUrl(imagePath, 'artist_page')}
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
                    src={apiService.getImageUrl(img.path, 'artist_page')}
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
                          await apiService.setArtistImagePrimary(id, img.id);
                          const res = await apiService.getArtistImages(id);
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
                        await apiService.deleteArtistImage(id, img.id);
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
                placeholder="artist_123.jpg"
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
                  await apiService.addArtistImage(id, newImageUrl, newImageName, setPrimary);
                  const res = await apiService.getArtistImages(id);
                  setImages(res.data);
                  if (setPrimary) setImagePath(newImageName);
                  setNewImageUrl('');
                  setNewImageName(toFilename(name) + '.jpg');
                  toast.success('Image added');
                } catch (err) {
                  const msg = err?.response?.data?.error || err?.message || 'Failed to add image';
                  toast.error(msg);
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
          <TagsSection entityType="artist" entityId={parseInt(id)} isLoggedIn={true} />
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
            placeholder="e.g., The_Beatles or a full wikipedia.org URL"
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
            entityType="artist"
            value={musicbrainzId}
            mbidStatus={mbidStatus}
            searchDefault={name}
            pending={musicbrainzId !== (artistData.musicbrainz_id || '')}
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
              marginLeft: 'auto',
              padding: '0.75rem 1.5rem',
              backgroundColor: '#ef4444',
              color: 'white',
              border: 'none',
              borderRadius: '4px',
              fontSize: '1rem',
              cursor: saving ? 'not-allowed' : 'pointer',
            }}
          >
            Delete Artist
          </button>
        </div>
      </form>

      {/* Relations Section */}
      <div style={{
        marginTop: '3rem',
        padding: '1.5rem',
        backgroundColor: '#f0fdf4',
        borderRadius: '4px',
        border: '1px solid #86efac'
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
          <h3 style={{ fontSize: '1.25rem', fontWeight: 'bold', margin: 0, color: '#166534' }}>
            Relations
          </h3>
          {!showAddRelationSection && (
            <button
              type="button"
              onClick={() => setShowAddRelationSection(true)}
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
              + Add Relation
            </button>
          )}
        </div>

        {/* Add Relation Form */}
        {showAddRelationSection && (
          <div style={{ marginBottom: '0' }}>
            <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '0.5rem', alignItems: 'center', flexWrap: 'wrap' }}>
              <select
                value={relationTypeToAdd}
                onChange={(e) => {
                  setRelationTypeToAdd(e.target.value);
                  setAddRelationResults([]);
                  setAddRelationQuery('');
                }}
                style={{ padding: '0.5rem', fontSize: '0.875rem', border: '1px solid #86efac', borderRadius: '4px', backgroundColor: 'var(--color-bg-surface)' }}
              >
                <option value="similar_artist">Similar Artist (Manual)</option>
                <option value="related_artist">Related Artist</option>
                <option value="member">Member</option>
                <option value="member_of">Member Of</option>
                <option value="appears_on">Appears On Album</option>
              </select>
              {relationTypeToAdd === 'appears_on' && (
                <select
                  value={addRelationRole}
                  onChange={(e) => setAddRelationRole(e.target.value)}
                  style={{ padding: '0.5rem', fontSize: '0.875rem', border: '1px solid #86efac', borderRadius: '4px', backgroundColor: 'var(--color-bg-surface)' }}
                >
                  <option value="featured">Featured</option>
                  <option value="collaborator">Collaborator</option>
                  <option value="compilation">Compilation</option>
                  <option value="guest">Guest</option>
                </select>
              )}
              <button
                type="button"
                onClick={() => { setShowAddRelationSection(false); setAddRelationResults([]); setAddRelationQuery(''); }}
                style={{ padding: '0.5rem', backgroundColor: 'var(--color-text-muted)', color: 'var(--color-bg-surface)', border: 'none', borderRadius: '4px', fontSize: '0.875rem', cursor: 'pointer' }}
              >
                Cancel
              </button>
            </div>
            <form onSubmit={handleAddRelationSearch} style={{ display: 'flex', gap: '0.5rem', marginBottom: '0.75rem' }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <input
                  type="text"
                  value={addRelationQuery}
                  onChange={(e) => setAddRelationQuery(e.target.value)}
                  placeholder={relationTypeToAdd === 'appears_on' ? 'Search album title...' : 'Search artist name...'}
                  autoFocus
                  style={{ width: '100%', boxSizing: 'border-box', padding: '0.5rem', fontSize: '0.875rem', border: '1px solid #86efac', borderRadius: '4px' }}
                />
              </div>
              <button
                type="submit"
                disabled={addRelationSearching || addRelationQuery.length < 2}
                style={{ padding: '0.5rem 1rem', backgroundColor: '#3b82f6', color: 'white', border: 'none', borderRadius: '4px', fontSize: '0.875rem', cursor: 'pointer' }}
              >
                {addRelationSearching ? 'Searching...' : 'Search'}
              </button>
            </form>
            {addRelationResults.length > 0 && (
              <div style={{ maxHeight: '250px', overflowY: 'auto', border: '1px solid #86efac', borderRadius: '4px', backgroundColor: 'var(--color-bg-surface)', marginBottom: '0.75rem' }}>
                {addRelationResults.map(item => (
                  <div key={item.id} style={{ padding: '0.6rem 0.75rem', borderBottom: '1px solid var(--color-border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div>
                      <span style={{ fontWeight: '500' }}>{item.name || item.title}</span>
                      {String(item.id) === String(id) && (
                        <span style={{ fontSize: '0.8rem', color: 'var(--color-text-muted)', fontStyle: 'italic', marginLeft: '0.5rem' }}>(this artist)</span>
                      )}
                      {item.artist && <span style={{ fontSize: '0.8rem', color: 'var(--color-text-muted)', marginLeft: '0.5rem' }}>by {item.artist.name}</span>}
                      {(relationTypeToAdd === 'related_artist' || relationTypeToAdd === 'member' || relationTypeToAdd === 'member_of') && (
                        <span style={{ fontSize: '0.8rem', color: 'var(--color-text-muted)', marginLeft: '0.5rem' }}>{formatCount(Number(item.album_count), 'album')} · ID {item.id}</span>
                      )}
                    </div>
                    <button
                      type="button"
                      onClick={() => handleAddRelation(item)}
                      style={{ padding: '0.25rem 0.75rem', backgroundColor: '#16a34a', color: 'white', border: 'none', borderRadius: '4px', fontSize: '0.75rem', cursor: 'pointer' }}
                    >
                      Add
                    </button>
                  </div>
                ))}
              </div>
            )}
            <hr style={{ border: 'none', borderTop: '1px solid #86efac', margin: '0 0 0.75rem 0' }} />
          </div>
        )}

        <div style={{ maxHeight: '400px', overflowY: 'auto' }}>

        {/* Similar Artists (manual) */}
        {(() => {
          const allSimilar = relatedArtists.filter(r => r.kind === 'similar');
          const visibleSimilar = showHiddenRelations ? allSimilar : allSimilar.filter(r => !r.is_hidden);
          const hiddenCount = allSimilar.filter(r => r.is_hidden).length;
          if (allSimilar.length === 0) return null;
          return (
            <div style={{ marginBottom: '1rem' }}>
              <div style={{ fontSize: '0.75rem', fontWeight: '600', color: '#166534', marginBottom: '0.5rem', textTransform: 'uppercase', letterSpacing: '0.05em', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                Similar Artists
                {hiddenCount > 0 && (
                  <button
                    type="button"
                    onClick={() => setShowHiddenRelations(v => !v)}
                    style={{ fontSize: '0.65rem', padding: '0.1rem 0.4rem', backgroundColor: 'var(--color-text-secondary)', borderRadius: '9999px', color: 'var(--color-text-faint)', border: 'none', cursor: 'pointer', textTransform: 'none', letterSpacing: 0 }}
                  >
                    {showHiddenRelations ? `hide ${hiddenCount} hidden` : `show ${hiddenCount} hidden`}
                  </button>
                )}
              </div>
              {visibleSimilar.map(ra => (
                <div key={ra.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.5rem 0', borderBottom: '1px solid #bbf7d0', opacity: ra.is_hidden ? 0.45 : 1 }}>
                  <span style={{ fontWeight: '500', color: ra.is_hidden ? 'var(--color-text-faint)' : '#7c3aed', cursor: 'pointer', textDecoration: ra.is_hidden ? 'line-through' : 'none' }} onClick={() => navigate(`/artist/${ra.id}`)}>
                    {ra.name}
                    {ra.similarity != null && <span style={{ fontSize: '0.65rem', color: 'var(--color-text-muted)', marginLeft: '0.4rem' }}>{(ra.similarity * 100).toFixed(0)}%</span>}
                    {ra.source !== 'manual' && <span style={{ fontSize: '0.65rem', color: 'var(--color-text-secondary)', marginLeft: '0.3rem' }}>({ra.source})</span>}
                  </span>
                  <div style={{ display: 'flex', gap: '0.4rem' }}>
                    <button
                      type="button"
                      onClick={() => handleToggleForceShow(ra.id, ra.force_show)}
                      title={ra.force_show ? 'Unpin (remove force-show)' : 'Pin (always include in similar artists)'}
                      style={{ padding: '0.25rem 0.5rem', backgroundColor: ra.force_show ? '#7c3aed' : 'var(--color-text-secondary)', color: ra.force_show ? 'white' : 'var(--color-bg-surface)', border: 'none', borderRadius: '4px', fontSize: '0.75rem', cursor: 'pointer' }}
                    >
                      {ra.force_show ? 'Pinned' : 'Pin'}
                    </button>
                    <button
                      type="button"
                      onClick={() => handleToggleHideRelation(ra.id, ra.is_hidden)}
                      style={{ padding: '0.25rem 0.5rem', backgroundColor: ra.is_hidden ? 'var(--color-text-secondary)' : 'var(--color-text-muted)', color: 'var(--color-bg-surface)', border: 'none', borderRadius: '4px', fontSize: '0.75rem', cursor: 'pointer' }}
                    >
                      {ra.is_hidden ? 'Unhide' : 'Hide'}
                    </button>
                    {ra.source === 'manual' && (
                      <button
                        type="button"
                        onClick={() => handleRemoveRelatedArtist(ra.id, ra.kind)}
                        style={{ padding: '0.25rem 0.5rem', backgroundColor: '#ef4444', color: 'white', border: 'none', borderRadius: '4px', fontSize: '0.75rem', cursor: 'pointer' }}
                      >
                        Remove
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          );
        })()}

        {/* Members */}
        {relatedArtists.filter(r => r.kind === 'member').length > 0 && (
          <div style={{ marginBottom: '1rem' }}>
            <div style={{ fontSize: '0.75rem', fontWeight: '600', color: '#166534', marginBottom: '0.5rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              Members
            </div>
            {relatedArtists.filter(r => r.kind === 'member').map(ra => (
              <div key={ra.id} style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                padding: '0.5rem 0',
                borderBottom: '1px solid #bbf7d0'
              }}>
                <span
                  style={{ fontWeight: '500', color: '#7c3aed', cursor: 'pointer' }}
                  onClick={() => navigate(`/artist/${ra.id}`)}
                >
                  {ra.name}
                </span>
                <button
                  type="button"
                  onClick={() => handleRemoveRelatedArtist(ra.id, ra.kind)}
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
            ))}
          </div>
        )}

        {/* Member Of */}
        {relatedArtists.filter(r => r.kind === 'member_of').length > 0 && (
          <div style={{ marginBottom: '1rem' }}>
            <div style={{ fontSize: '0.75rem', fontWeight: '600', color: '#166534', marginBottom: '0.5rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              Member Of
            </div>
            {relatedArtists.filter(r => r.kind === 'member_of').map(ra => (
              <div key={ra.id} style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                padding: '0.5rem 0',
                borderBottom: '1px solid #bbf7d0'
              }}>
                <span
                  style={{ fontWeight: '500', color: '#7c3aed', cursor: 'pointer' }}
                  onClick={() => navigate(`/artist/${ra.id}`)}
                >
                  {ra.name}
                </span>
                <button
                  type="button"
                  onClick={() => handleRemoveMemberOf(ra.id)}
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
            ))}
          </div>
        )}

        {/* Related Artists */}
        {relatedArtists.filter(r => r.kind === 'related').length > 0 && (
          <div style={{ marginBottom: '1rem' }}>
            <div style={{ fontSize: '0.75rem', fontWeight: '600', color: '#166534', marginBottom: '0.5rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              Related Artists
            </div>
            {relatedArtists.filter(r => r.kind === 'related').map(ra => (
              <div key={ra.id} style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                padding: '0.5rem 0',
                borderBottom: '1px solid #bbf7d0'
              }}>
                <span
                  style={{ fontWeight: '500', color: '#7c3aed', cursor: 'pointer' }}
                  onClick={() => navigate(`/artist/${ra.id}`)}
                >
                  {ra.name}
                </span>
                <button
                  type="button"
                  onClick={() => handleRemoveRelatedArtist(ra.id, ra.kind)}
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
            ))}
          </div>
        )}

        {/* Appears On Albums */}
        {appearsOnAlbums.length > 0 && (
          <div style={{ marginBottom: '1rem' }}>
            <div style={{ fontSize: '0.75rem', fontWeight: '600', color: '#166534', marginBottom: '0.5rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              Appears On
            </div>
            {appearsOnAlbums.map(a => (
              <div key={a.album_id} style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                padding: '0.5rem 0',
                borderBottom: '1px solid #bbf7d0'
              }}>
                <span style={{ fontWeight: '500' }}>
                  <span
                    style={{ color: '#7c3aed', cursor: 'pointer' }}
                    onClick={() => navigate(`/album/${a.album_id}`)}
                  >{a.title}</span>
                  {a.release_year && <span style={{ fontWeight: 'normal', color: 'var(--color-text-muted)', marginLeft: '0.5rem' }}>({a.release_year})</span>}
                </span>
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
                    onClick={() => handleRemoveAlbumFromArtist(a.album_id)}
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

        </div>

      </div>

      {/* Merge With Another Artist Section */}
      <div style={{
        marginTop: '3rem',
        padding: '1.5rem',
        backgroundColor: 'var(--color-warning-bg)',
        borderRadius: '4px',
        border: '1px solid var(--color-warning-border)'
      }}>
        <h3 style={{ fontSize: '1.25rem', fontWeight: 'bold', marginBottom: '1rem', color: 'var(--color-warning-text)' }}>
          Merge With Another Artist
        </h3>
        <p style={{ marginBottom: '1rem', color: 'var(--color-warning-text)', fontSize: '0.875rem' }}>
          Use this to fix duplicate or misspelled artists (e.g. from bad ID3 tags). One artist is always deleted; its albums, tracks, and credits move to the other.
        </p>

        <button
          type="button"
          onClick={suggestedDuplicates !== null ? () => { setSuggestedDuplicates(null); setSelectedSuggestionIds(new Set()); } : handleSuggestDuplicates}
          disabled={loadingSuggestions}
          style={{
            padding: '0.5rem 1rem',
            backgroundColor: 'var(--color-text-muted)',
            color: 'white',
            border: 'none',
            borderRadius: '4px',
            fontSize: '0.875rem',
            cursor: loadingSuggestions ? 'not-allowed' : 'pointer',
            marginBottom: '1rem',
          }}
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
                  Select artists to merge into "{artistData.name}":
                </div>
                {suggestedDuplicates.map(stub => (
                  <label key={stub.id} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.3rem 0', cursor: 'pointer', fontSize: '0.875rem' }}>
                    <input
                      type="checkbox"
                      checked={selectedSuggestionIds.has(stub.id)}
                      onChange={e => {
                        const next = new Set(selectedSuggestionIds);
                        e.target.checked ? next.add(stub.id) : next.delete(stub.id);
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
                  onClick={handleMergeSuggestions}
                  disabled={mergingSuggestions || selectedSuggestionIds.size === 0}
                  style={{
                    marginTop: '0.5rem',
                    width: '100%',
                    padding: '0.5rem',
                    backgroundColor: selectedSuggestionIds.size === 0 ? 'var(--color-border)' : '#3b82f6',
                    color: 'white',
                    border: 'none',
                    borderRadius: '4px',
                    fontSize: '0.875rem',
                    cursor: (mergingSuggestions || selectedSuggestionIds.size === 0) ? 'not-allowed' : 'pointer',
                  }}
                >
                  {mergingSuggestions ? 'Merging...' : `Merge ${selectedSuggestionIds.size} selected into "${artistData.name}"`}
                </button>
              </>
            )}
          </div>
        )}

        <form onSubmit={handleMergeSearch} style={{ marginBottom: '1rem' }}>
          <div style={{ display: 'flex', gap: '0.5rem' }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <input
                type="text"
                value={mergeQuery}
                onChange={(e) => {
                  setMergeQuery(e.target.value);
                  setSelectedMergeTarget(null);
                  setMergeResults([]);
                  setHasSearchedMerge(false);
                }}
                placeholder="Search for another artist..."
                style={{
                  width: '100%',
                  boxSizing: 'border-box',
                  padding: '0.5rem',
                  fontSize: '1rem',
                  border: '1px solid var(--color-warning-border)',
                  borderRadius: '4px',
                  backgroundColor: 'var(--color-bg-surface)',
                  color: 'var(--color-text-primary)',
                }}
              />
            </div>
            <button
              type="submit"
              disabled={mergeSearching || mergeQuery.length < 2}
              style={{
                padding: '0.5rem 1rem',
                backgroundColor: 'var(--color-text-muted)',
                color: 'white',
                border: 'none',
                borderRadius: '4px',
                fontSize: '0.875rem',
                cursor: 'pointer',
                whiteSpace: 'nowrap',
              }}
            >
              {mergeSearching ? 'Searching...' : 'Search'}
            </button>
          </div>
        </form>

        {mergeResults.length > 0 && !selectedMergeTarget && (
          <div style={{ marginBottom: '1rem', border: '1px solid var(--color-warning-border)', borderRadius: '4px', backgroundColor: 'var(--color-bg-surface)', maxHeight: '200px', overflowY: 'auto', color: 'var(--color-text-primary)' }}>
            {mergeResults.map(artist => (
              <div
                key={artist.id}
                onClick={() => handleSelectMergeTarget(artist)}
                style={{
                  padding: '0.6rem 0.75rem',
                  borderBottom: '1px solid var(--color-border)',
                  cursor: 'pointer',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                }}
                onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = 'var(--color-warning-bg-hover)')}
                onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = 'var(--color-bg-surface)')}
              >
                <span style={{ fontWeight: '500' }}>{artist.name}</span>
                <span style={{ fontSize: '0.8rem', color: 'var(--color-text-muted)' }}>{formatCount(Number(artist.album_count), 'album')} · ID {artist.id}</span>
              </div>
            ))}
          </div>
        )}

        {hasSearchedMerge && mergeResults.length === 0 && !mergeSearching && !selectedMergeTarget && (
          <button
            type="button"
            onClick={handleCreateAndMerge}
            disabled={merging}
            style={{
              padding: '0.5rem 1rem',
              backgroundColor: '#3b82f6',
              color: 'white',
              border: 'none',
              borderRadius: '4px',
              fontSize: '0.875rem',
              cursor: merging ? 'not-allowed' : 'pointer',
              marginBottom: '1rem',
            }}
          >
            {merging ? 'Creating...' : `Create "${mergeQuery.trim()}" & merge this artist into it`}
          </button>
        )}

        {selectedMergeTarget && (
          <div style={{ marginBottom: '1rem' }}>
            <p style={{ color: 'var(--color-warning-text)', fontSize: '0.875rem', marginBottom: '0.5rem' }}>
              Target: <strong>{selectedMergeTarget.name}</strong>
              <button
                type="button"
                onClick={() => { setSelectedMergeTarget(null); setMergeQuery(''); }}
                style={{ marginLeft: '0.5rem', background: 'none', border: 'none', color: 'var(--color-text-muted)', cursor: 'pointer', fontSize: '0.875rem' }}
              >
                ✕
              </button>
            </p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem', marginBottom: '0.75rem', fontSize: '0.875rem', color: 'var(--color-warning-text)' }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', cursor: 'pointer' }}>
                <input type="radio" checked={keepThisArtist} onChange={() => setKeepThisArtist(true)} />
                Keep this artist ("{artistData.name}") — delete "{selectedMergeTarget.name}"
              </label>
              <label style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', cursor: 'pointer' }}>
                <input type="radio" checked={!keepThisArtist} onChange={() => setKeepThisArtist(false)} />
                Keep "{selectedMergeTarget.name}" — delete this artist ("{artistData.name}")
              </label>
            </div>
            <button
              type="button"
              onClick={handleMerge}
              disabled={merging}
              style={{
                padding: '0.75rem 1.5rem',
                backgroundColor: '#ff8c00',
                color: 'white',
                border: 'none',
                borderRadius: '4px',
                fontSize: '1rem',
                cursor: merging ? 'not-allowed' : 'pointer',
                opacity: merging ? 0.6 : 1,
              }}
            >
              {merging ? 'Merging...' : 'Merge'}
            </button>
          </div>
        )}
      </div>

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

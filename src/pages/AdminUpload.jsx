// src/pages/AdminUpload.jsx
import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { apiService } from '../services/api';
import jsmediatags from 'jsmediatags';
import { useUploadTabTitle } from '../hooks/useUploadTabTitle';
import { formatCount } from '../utils/formatters';

const VARIOUS_ARTISTS = { id: 161, name: 'Various Artists' };

const AdminUpload = () => {
  // Form state
  const [genre, setGenre] = useState('');
  const [trackPad, setTrackPad] = useState('0');
  const [albumArtUrl, setAlbumArtUrl] = useState('');
  const [albumArtName, setAlbumArtName] = useState('');
  const [selectedFiles, setSelectedFiles] = useState([]);

  // Status
  const [inFlightBatches, setInFlightBatches] = useState([]);
  useUploadTabTitle(inFlightBatches);
  const [message, setMessage] = useState(null);
  const [error, setError] = useState(null);

  // Recent uploads
  const [recentUploads, setRecentUploads] = useState([]);
  const [loadingRecent, setLoadingRecent] = useState(false);

  // Upload stats
  const [stats, setStats] = useState(null);

  const [filePreviews, setFilePreviews] = useState([]);

  // Artist inline picker
  const [artistQuery, setArtistQuery] = useState('');
  const [artistResults, setArtistResults] = useState([]);
  const [artistSearching, setArtistSearching] = useState(false);
  const [selectedArtist, setSelectedArtist] = useState(null);

  // Album inline picker
  const [albumQuery, setAlbumQuery] = useState('');
  const [albumResults, setAlbumResults] = useState([]);
  const [albumSearching, setAlbumSearching] = useState(false);
  const [selectedAlbum, setSelectedAlbum] = useState(null);

  const [isCompilation, setIsCompilation] = useState(false);
  const [isSingle, setIsSingle] = useState(false);

  // Prevent the exact bug that fragmented a real upload into one album per
  // ID3 artist tag: a various-artists batch must always resolve to a single,
  // stable album artist, never per-file tags. Locking the field to the
  // placeholder as soon as compilation is checked closes that gap entirely.
  useEffect(() => {
    if (isCompilation) {
      setSelectedArtist(VARIOUS_ARTISTS);
      setArtistQuery('');
      setArtistResults([]);
    }
  }, [isCompilation]);

  useEffect(() => {
    loadRecentUploads();
    loadStats();

    // Auto-refresh every 5 seconds
    const interval = setInterval(() => {
      loadRecentUploads();
      loadStats();
    }, 5000);

    return () => clearInterval(interval);
  }, []);

  const loadRecentUploads = async () => {
    try {
      setLoadingRecent(true);
      const response = await apiService.getRecentUploads(20);
      setRecentUploads(response.data);
    } catch (error) {
      console.error('Failed to load recent uploads:', error);
    } finally {
      setLoadingRecent(false);
    }
  };

  const loadStats = async () => {
    try {
      const response = await apiService.getUploadStatus();
      setStats(response.data.stats);
    } catch (error) {
      console.error('Failed to load stats:', error);
    }
  };

  const readTags = (file) =>
    new Promise((resolve) => {
      jsmediatags.read(file, {
        onSuccess: (tag) => resolve(tag.tags),
        onError: () => resolve({}),
      });
    });

  const handleFileChange = async (e) => {
    const files = Array.from(e.target.files);
    setSelectedFiles(files);
    if (files.length === 0) {
      setFilePreviews([]);
      return;
    }
    const previews = await Promise.all(
      files.map(async (file) => {
        const tags = await readTags(file);
        return {
          filename: file.name,
          title: tags.title || null,
          artist: tags.artist || null,
          album: tags.album || null,
          track: tags.track || null,
        };
      })
    );
    setFilePreviews(previews);
  };

  // Builds the FormData for a single file's request, repeating the shared
  // batch-level metadata (artist/album/genre/etc.) on each one — each file
  // is its own independent request (see handleSubmit), so each needs the
  // full field set the backend expects.
  const buildFileFormData = (file, meta) => {
    const formData = new FormData();
    formData.append('files', file);

    if (meta.artistId) {
      formData.append('artist_id', String(meta.artistId));
    } else if (meta.artistName) {
      formData.append('artist_name', meta.artistName);
    }

    if (!meta.isSingle) {
      if (meta.albumId) {
        formData.append('album_id', String(meta.albumId));
      } else if (meta.albumName) {
        formData.append('album_name', meta.albumName);
      }
    }
    formData.append('is_compilation', String(meta.isCompilation));
    formData.append('is_single', String(meta.isSingle));
    if (meta.genre) formData.append('genre', meta.genre);
    if (meta.trackPad) formData.append('track_pad', meta.trackPad);
    if (meta.albumArtUrl) formData.append('album_art_url', meta.albumArtUrl);
    if (meta.albumArtName) formData.append('album_art_name', meta.albumArtName);

    return formData;
  };

  // Submits exactly one file's request and updates its row in place. A
  // dropped connection here only fails this one row — the rest of the
  // batch's sequential loop (or a Retry click) is unaffected. Returns
  // whether it succeeded, so callers can tally a batch-level count.
  const uploadOneFile = async (batchId, fileEntry, meta) => {
    setInFlightBatches((prev) =>
      prev.map((b) =>
        b.id !== batchId
          ? b
          : { ...b, files: b.files.map((f) => (f.id === fileEntry.id ? { ...f, status: 'uploading', error: undefined } : f)) }
      )
    );

    try {
      await apiService.uploadTracks(buildFileFormData(fileEntry.file, meta));
      setInFlightBatches((prev) =>
        prev
          .map((b) => (b.id !== batchId ? b : { ...b, files: b.files.filter((f) => f.id !== fileEntry.id) }))
          .filter((b) => b.files.length > 0)
      );
      return true;
    } catch (err) {
      console.error('Upload error:', err);
      const msg = err.response?.data?.error || 'Failed to upload file';
      setInFlightBatches((prev) =>
        prev.map((b) =>
          b.id !== batchId
            ? b
            : { ...b, files: b.files.map((f) => (f.id === fileEntry.id ? { ...f, status: 'failed', error: msg } : f)) }
        )
      );
      return false;
    }
  };

  const handleDismissFile = (batchId, fileId) => {
    setInFlightBatches((prev) =>
      prev
        .map((b) => (b.id !== batchId ? b : { ...b, files: b.files.filter((f) => f.id !== fileId) }))
        .filter((b) => b.files.length > 0)
    );
  };

  const handleRetryFile = (batchId, fileEntry) => {
    const batch = inFlightBatches.find((b) => b.id === batchId);
    if (!batch) return;
    uploadOneFile(batchId, fileEntry, batch.meta).then(() => {
      loadRecentUploads();
      loadStats();
    });
  };

  const handleRetryAllFailed = async (batchId) => {
    const batch = inFlightBatches.find((b) => b.id === batchId);
    if (!batch) return;
    const failedEntries = batch.files.filter((f) => f.status === 'failed');
    for (const fileEntry of failedEntries) {
      await uploadOneFile(batchId, fileEntry, batch.meta);
    }
    loadRecentUploads();
    loadStats();
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    if (selectedFiles.length === 0) {
      setError('Please select at least one file');
      return;
    }

    setError(null);

    const filesToUpload = selectedFiles;
    const meta = {
      artistId: selectedArtist ? selectedArtist.id : null,
      artistName: !selectedArtist && artistQuery.trim() ? artistQuery.trim() : null,
      albumId: !isSingle && selectedAlbum ? selectedAlbum.id : null,
      albumName: !isSingle && !selectedAlbum && albumQuery.trim() ? albumQuery.trim() : null,
      isCompilation,
      isSingle,
      genre,
      trackPad,
      albumArtUrl,
      albumArtName,
    };

    const batchId = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    setInFlightBatches((prev) => [
      ...prev,
      {
        id: batchId,
        meta,
        files: filesToUpload.map((file, i) => ({ id: `${batchId}-${i}`, file, name: file.name, status: 'queued' })),
      },
    ]);

    // Reset the form immediately so a new batch can be started right away —
    // meta/filesToUpload above were already captured from the current
    // state, so a later selection can't corrupt this in-flight submission.
    setArtistQuery('');
    setSelectedArtist(null);
    setArtistResults([]);
    setAlbumQuery('');
    setSelectedAlbum(null);
    setAlbumResults([]);
    setIsCompilation(false);
    setIsSingle(false);
    setGenre('');
    setTrackPad('0');
    setAlbumArtUrl('');
    setAlbumArtName('');
    setSelectedFiles([]);
    setFilePreviews([]);
    const fileInput = document.getElementById('file-input');
    if (fileInput) fileInput.value = '';

    // Files go one at a time, not bundled into one request: a single
    // dropped connection during a large batch only loses the file in
    // flight, not everything queued behind it.
    let successCount = 0;
    for (let i = 0; i < filesToUpload.length; i++) {
      const fileEntry = { id: `${batchId}-${i}`, file: filesToUpload[i], name: filesToUpload[i].name };
      const ok = await uploadOneFile(batchId, fileEntry, meta);
      if (ok) successCount++;
    }

    if (successCount > 0) {
      setMessage(`Successfully queued ${successCount} file(s) for processing`);
      setTimeout(() => setMessage(null), 5000);
    }

    loadRecentUploads();
    loadStats();
  };

  const handleRetry = async (id) => {
    try {
      await apiService.retryUpload(id);
      loadRecentUploads();
      loadStats();
    } catch (error) {
      console.error('Failed to retry upload:', error);
    }
  };

  const handleDismiss = async (id) => {
    try {
      await apiService.dismissUpload(id);
      setRecentUploads(recentUploads.filter((u) => u.id !== id));
      loadStats();
    } catch (error) {
      console.error('Failed to dismiss upload:', error);
      loadRecentUploads();
    }
  };

  const handleClearFailed = async () => {
    if (!confirm('Clear all failed uploads? This cannot be undone.')) return;
    try {
      await apiService.clearFailedUploads();
      setRecentUploads(recentUploads.filter((u) => u.status !== 'failed'));
      loadStats();
    } catch (error) {
      console.error('Failed to clear failed uploads:', error);
      loadRecentUploads();
    }
  };

  const getStatusColor = (status) => {
    switch (status) {
      case 'completed': return '#10b981';
      case 'processing': return '#3b82f6';
      case 'failed': return '#ef4444';
      default: return 'var(--color-text-muted)';
    }
  };

  const formatDate = (dateString) => {
    return new Date(dateString).toLocaleString();
  };

  // stats.failed comes back from Postgres as a string (int8 count with no
  // pg type parser override), so a strict `=== 0` comparison never matches
  // in production. Coerce to a number once here rather than repeating the
  // fragile comparison at each call site.
  const noFailedUploads = !stats || Number(stats.failed) === 0;

  const handleArtistSearch = async (e) => {
    if (e?.preventDefault) e.preventDefault();
    if (artistQuery.length < 2) return;
    setArtistSearching(true);
    try {
      const response = await apiService.searchAdminArtists(artistQuery);
      setArtistResults(response.data || []);
    } catch (err) {
      console.error('Artist search error:', err);
    } finally {
      setArtistSearching(false);
    }
  };

  const handleArtistSelect = (artist) => {
    setSelectedArtist(artist);
    setArtistQuery('');
    setArtistResults([]);
  };

  const handleArtistClear = () => {
    setSelectedArtist(null);
    setArtistQuery('');
    setArtistResults([]);
  };

  const handleAlbumSearch = async (e) => {
    if (e?.preventDefault) e.preventDefault();
    if (albumQuery.length < 2) return;
    setAlbumSearching(true);
    try {
      const response = await apiService.searchAdminAlbums(albumQuery);
      setAlbumResults(response.data || []);
    } catch (err) {
      console.error('Album search error:', err);
    } finally {
      setAlbumSearching(false);
    }
  };

  const handleAlbumSelect = (album) => {
    setSelectedAlbum(album);
    setAlbumQuery('');
    setAlbumResults([]);
    setTrackPad(String(Number(album.track_count) || 0));
  };

  const handleAlbumClear = () => {
    setSelectedAlbum(null);
    setAlbumQuery('');
    setAlbumResults([]);
    setTrackPad('0');
  };

  return (
    <div style={{ padding: '2rem', maxWidth: '1200px', margin: '0 auto' }}>
      <h1 style={{ marginBottom: '2rem', fontSize: '2rem' }}>Upload Tracks</h1>

      {/* Stats Cards */}
      {stats && (
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))',
          gap: '1rem',
          marginBottom: '2rem'
        }}>
          <div style={{ padding: '1rem', backgroundColor: 'var(--color-bg-surface-muted)', borderRadius: '4px' }}>
            <div style={{ fontSize: '0.875rem', color: 'var(--color-text-muted)' }}>Pending</div>
            <div style={{ fontSize: '1.5rem', fontWeight: 'bold' }}>{stats.pending}</div>
          </div>
          <div style={{ padding: '1rem', backgroundColor: '#dbeafe', borderRadius: '4px' }}>
            <div style={{ fontSize: '0.875rem', color: '#1e40af' }}>Processing</div>
            <div style={{ fontSize: '1.5rem', fontWeight: 'bold', color: '#1e40af' }}>{stats.processing}</div>
          </div>
          <div style={{ padding: '1rem', backgroundColor: '#d1fae5', borderRadius: '4px' }}>
            <div style={{ fontSize: '0.875rem', color: '#065f46' }}>Completed</div>
            <div style={{ fontSize: '1.5rem', fontWeight: 'bold', color: '#065f46' }}>{stats.completed}</div>
          </div>
          <div style={{ padding: '1rem', backgroundColor: '#fee2e2', borderRadius: '4px' }}>
            <div style={{ fontSize: '0.875rem', color: '#991b1b' }}>Failed</div>
            <div style={{ fontSize: '1.5rem', fontWeight: 'bold', color: '#991b1b' }}>{stats.failed}</div>
          </div>
        </div>
      )}

      {/* Messages */}
      {message && (
        <div style={{
          padding: '1rem',
          marginBottom: '1rem',
          backgroundColor: '#d1fae5',
          color: '#065f46',
          borderRadius: '4px'
        }}>
          {message}
        </div>
      )}

      {error && (
        <div style={{
          padding: '1rem',
          marginBottom: '1rem',
          backgroundColor: '#fee2e2',
          color: '#991b1b',
          borderRadius: '4px'
        }}>
          {error}
        </div>
      )}

      {inFlightBatches.length > 0 && (
        <div style={{ marginBottom: '1rem', maxHeight: '260px', overflowY: 'auto', display: 'grid', gap: '0.5rem' }}>
          {inFlightBatches.map((batch) => {
            const failedCount = batch.files.filter((f) => f.status === 'failed').length;
            return (
              <div key={batch.id} style={{ border: '1px solid var(--color-border)', borderRadius: '4px', overflow: 'hidden' }}>
                <div style={{
                  padding: '0.5rem 0.75rem',
                  backgroundColor: 'var(--color-bg-surface-muted)',
                  fontSize: '0.8rem',
                  fontWeight: '600',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                }}>
                  <span>Batch of {batch.files.length} file(s)</span>
                  {failedCount > 1 && (
                    <button
                      type="button"
                      onClick={() => handleRetryAllFailed(batch.id)}
                      style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#3b82f6', fontSize: '0.8rem' }}
                    >
                      Retry all failed
                    </button>
                  )}
                </div>
                {batch.files.map((f) => (
                  <div
                    key={f.id}
                    style={{
                      padding: '0.5rem 0.75rem',
                      borderTop: '1px solid var(--color-border)',
                      backgroundColor: f.status === 'failed' ? '#fee2e2' : '#eff6ff',
                      color: f.status === 'failed' ? '#991b1b' : '#1e40af',
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      fontSize: '0.8rem',
                    }}
                  >
                    <span>
                      {f.status === 'failed'
                        ? `${f.name} — failed: ${f.error}`
                        : f.status === 'uploading'
                        ? `${f.name} — uploading…`
                        : `${f.name} — waiting…`}
                    </span>
                    {f.status === 'failed' && (
                      <span style={{ display: 'flex', gap: '0.5rem' }}>
                        <button
                          type="button"
                          aria-label={`Retry ${f.name}`}
                          onClick={() => handleRetryFile(batch.id, f)}
                          style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'inherit', fontSize: '0.75rem', textDecoration: 'underline' }}
                        >
                          Retry
                        </button>
                        <button
                          type="button"
                          aria-label={`Dismiss ${f.name}`}
                          onClick={() => handleDismissFile(batch.id, f.id)}
                          style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'inherit', fontSize: '1rem' }}
                        >
                          ✕
                        </button>
                      </span>
                    )}
                  </div>
                ))}
              </div>
            );
          })}
        </div>
      )}

      {/* Upload Form */}
      <form onSubmit={handleSubmit} style={{
        padding: '2rem',
        backgroundColor: 'var(--color-bg-surface)',
        borderRadius: '8px',
        marginBottom: '2rem'
      }}>
        <h2 style={{ fontSize: '1.25rem', fontWeight: 'bold', marginBottom: '1.5rem' }}>
          Upload New Tracks
        </h2>

        <div style={{ display: 'grid', gap: '1.5rem' }}>
          {/* File Upload */}
          <div>
            <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 'bold' }}>
              Audio Files *
            </label>
            <input
              id="file-input"
              type="file"
              multiple
              accept=".mp3"
              onChange={handleFileChange}
              style={{
                width: '100%',
                padding: '0.5rem',
                fontSize: '1rem',
                border: '1px solid var(--color-border)',
                borderRadius: '4px',
              }}
            />
            {selectedFiles.length > 0 && (
              <div style={{ marginTop: '0.5rem', fontSize: '0.875rem', color: 'var(--color-text-muted)' }}>
                {selectedFiles.length} file(s) selected
              </div>
            )}
            {filePreviews.length > 0 && (
              <div style={{ marginTop: '0.75rem' }}>
                <div style={{ overflowX: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.8rem' }}>
                    <thead>
                      <tr style={{ backgroundColor: 'var(--color-bg-surface-muted)' }}>
                        <th style={{ padding: '0.4rem 0.6rem', textAlign: 'left', fontWeight: '600' }}>Filename</th>
                        <th style={{ padding: '0.4rem 0.6rem', textAlign: 'left', fontWeight: '600' }}>Title</th>
                        <th style={{ padding: '0.4rem 0.6rem', textAlign: 'left', fontWeight: '600' }}>Artist</th>
                        <th style={{ padding: '0.4rem 0.6rem', textAlign: 'left', fontWeight: '600' }}>Album</th>
                        <th style={{ padding: '0.4rem 0.6rem', textAlign: 'left', fontWeight: '600' }}>#</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filePreviews.map((p, i) => {
                        const displayTitle = p.title || p.filename.replace(/\.[^.]+$/, '');
                        const isFallback = !p.title;
                        return (
                          <tr key={i} style={{ borderBottom: '1px solid var(--color-border)' }}>
                            <td style={{ padding: '0.4rem 0.6rem', color: 'var(--color-text-muted)', fontFamily: 'monospace' }}>{p.filename}</td>
                            <td style={{ padding: '0.4rem 0.6rem', fontStyle: isFallback ? 'italic' : 'normal', color: isFallback ? 'var(--color-text-faint)' : 'inherit' }}>{displayTitle}</td>
                            <td style={{ padding: '0.4rem 0.6rem', color: p.artist ? 'inherit' : 'var(--color-text-faint)' }}>{p.artist || '—'}</td>
                            <td style={{ padding: '0.4rem 0.6rem', color: p.album ? 'inherit' : 'var(--color-text-faint)' }}>{p.album || '—'}</td>
                            <td style={{ padding: '0.4rem 0.6rem', color: p.track ? 'inherit' : 'var(--color-text-faint)' }}>{p.track || '—'}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
                <small style={{ color: 'var(--color-text-muted)', fontSize: '0.75rem', display: 'block', marginTop: '0.25rem' }}>
                  Artist and album overrides below take precedence over these tags.
                </small>
              </div>
            )}
          </div>

          {/* Artist Picker */}
          <div>
            <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 'bold' }}>
              Artist
            </label>
            {selectedArtist ? (
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <span style={{
                  padding: '0.4rem 0.75rem',
                  backgroundColor: '#e0f2fe',
                  borderRadius: '4px',
                  fontSize: '0.95rem',
                  fontWeight: '500',
                }}>
                  {selectedArtist.name}
                </span>
                {!isCompilation && (
                  <button
                    type="button"
                    onClick={handleArtistClear}
                    aria-label="Clear artist"
                    style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--color-text-muted)', fontSize: '1rem' }}
                  >
                    ✕
                  </button>
                )}
              </div>
            ) : (
              <div>
                <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '0.25rem' }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <input
                      type="text"
                      value={artistQuery}
                      onChange={(e) => { setArtistQuery(e.target.value); setArtistResults([]); }}
                      onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); handleArtistSearch(e); } }}
                      placeholder="Search by name or leave blank to use ID3 tag"
                      style={{ width: '100%', boxSizing: 'border-box', padding: '0.5rem', fontSize: '1rem', border: '1px solid var(--color-border)', borderRadius: '4px' }}
                    />
                  </div>
                  <button
                    type="button"
                    aria-label="Search artists"
                    onClick={handleArtistSearch}
                    disabled={artistSearching || artistQuery.length < 2}
                    style={{
                      padding: '0.5rem 1rem',
                      backgroundColor: 'var(--color-text-muted)',
                      color: 'white',
                      border: 'none',
                      borderRadius: '4px',
                      fontSize: '0.875rem',
                      cursor: artistSearching || artistQuery.length < 2 ? 'not-allowed' : 'pointer',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {artistSearching ? 'Searching…' : 'Search'}
                  </button>
                </div>
                {artistResults.length > 0 && (
                  <div style={{ border: '1px solid var(--color-border)', borderRadius: '4px', backgroundColor: 'var(--color-bg-surface)', maxHeight: '200px', overflowY: 'auto', marginBottom: '0.25rem' }}>
                    {artistResults.map((artist) => (
                      <div
                        key={artist.id}
                        onClick={() => handleArtistSelect(artist)}
                        style={{ padding: '0.6rem 0.75rem', borderBottom: '1px solid var(--color-border)', cursor: 'pointer', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}
                        onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = 'var(--color-bg-surface-muted)')}
                        onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = 'var(--color-bg-surface)')}
                      >
                        <span style={{ fontWeight: '500' }}>{artist.name}</span>
                        <span style={{ fontSize: '0.8rem', color: 'var(--color-text-muted)' }}>
                          {formatCount(Number(artist.album_count), 'album')}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
                <small style={{ color: 'var(--color-text-muted)', fontSize: '0.875rem' }}>
                  Optional. Leave blank to use ID3 tags, or type to search existing artists.
                </small>
              </div>
            )}
          </div>

          {/* Various Artists Compilation Toggle */}
          <div style={{ marginTop: '0.5rem' }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontWeight: 'bold', cursor: 'pointer' }}>
              <input
                type="checkbox"
                checked={isCompilation}
                onChange={(e) => {
                  setIsCompilation(e.target.checked);
                  if (e.target.checked) setIsSingle(false);
                }}
              />
              Various artists compilation
            </label>
            <small style={{ color: 'var(--color-text-muted)', fontSize: '0.875rem', display: 'block', marginTop: '0.25rem' }}>
              Each track gets its own artist from its file's ID3 tag. The Artist field above applies to the album only.
            </small>
          </div>

          {/* Singles Toggle */}
          <div style={{ marginTop: '0.5rem' }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontWeight: 'bold', cursor: 'pointer' }}>
              <input
                type="checkbox"
                checked={isSingle}
                onChange={(e) => {
                  setIsSingle(e.target.checked);
                  if (e.target.checked) {
                    setIsCompilation(false);
                    setSelectedArtist(null);
                  }
                }}
              />
              Singles
            </label>
            <small style={{ color: 'var(--color-text-muted)', fontSize: '0.875rem', display: 'block', marginTop: '0.25rem' }}>
              Each track is filed under its artist's _Singles album instead of a regular album.
            </small>
          </div>

          {/* Album Picker */}
          {!isSingle && (
          <div>
            <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 'bold' }}>
              Album
            </label>
            {selectedAlbum ? (
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <span style={{
                  padding: '0.4rem 0.75rem',
                  backgroundColor: '#e0f2fe',
                  borderRadius: '4px',
                  fontSize: '0.95rem',
                  fontWeight: '500',
                }}>
                  {selectedAlbum.title}
                  <span style={{ fontWeight: 'normal', color: 'var(--color-text-muted)', marginLeft: '0.4rem' }}>
                    · {selectedAlbum.artist_name}
                  </span>
                </span>
                <button
                  type="button"
                  onClick={handleAlbumClear}
                  aria-label="Clear album"
                  style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--color-text-muted)', fontSize: '1rem' }}
                >
                  ✕
                </button>
              </div>
            ) : (
              <div>
                <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '0.25rem' }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <input
                      type="text"
                      value={albumQuery}
                      onChange={(e) => { setAlbumQuery(e.target.value); setAlbumResults([]); }}
                      onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); handleAlbumSearch(e); } }}
                      placeholder="Search by title or leave blank to use ID3 tag"
                      style={{ width: '100%', boxSizing: 'border-box', padding: '0.5rem', fontSize: '1rem', border: '1px solid var(--color-border)', borderRadius: '4px' }}
                    />
                  </div>
                  <button
                    type="button"
                    aria-label="Search albums"
                    onClick={handleAlbumSearch}
                    disabled={albumSearching || albumQuery.length < 2}
                    style={{
                      padding: '0.5rem 1rem',
                      backgroundColor: 'var(--color-text-muted)',
                      color: 'white',
                      border: 'none',
                      borderRadius: '4px',
                      fontSize: '0.875rem',
                      cursor: albumSearching || albumQuery.length < 2 ? 'not-allowed' : 'pointer',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {albumSearching ? 'Searching…' : 'Search'}
                  </button>
                </div>
                {albumResults.length > 0 && (
                  <div style={{ border: '1px solid var(--color-border)', borderRadius: '4px', backgroundColor: 'var(--color-bg-surface)', maxHeight: '200px', overflowY: 'auto', marginBottom: '0.25rem' }}>
                    {albumResults.map((album) => (
                      <div
                        key={album.id}
                        onClick={() => handleAlbumSelect(album)}
                        style={{ padding: '0.6rem 0.75rem', borderBottom: '1px solid var(--color-border)', cursor: 'pointer' }}
                        onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = 'var(--color-bg-surface-muted)')}
                        onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = 'var(--color-bg-surface)')}
                      >
                        <div style={{ fontWeight: '500' }}>{album.title}</div>
                        <div style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)' }}>
                          {album.artist_name}{album.release_year ? ` · ${album.release_year}` : ''} · {formatCount(Number(album.track_count), 'track')}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
                <small style={{ color: 'var(--color-text-muted)', fontSize: '0.875rem' }}>
                  Optional. Leave blank to use ID3 tags, search to reuse an existing album, or type a
                  title without picking a result to override the tags and create a new album with that title.
                </small>
              </div>
            )}
          </div>
          )}

          {/* Genre and Track Pad */}
          <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: '1rem' }}>
            <div>
              <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 'bold' }}>
                Genre
              </label>
              <input
                type="text"
                value={genre}
                onChange={(e) => setGenre(e.target.value)}
                placeholder="e.g., Rock"
                style={{
                  width: '100%',
                  padding: '0.5rem',
                  fontSize: '1rem',
                  border: '1px solid var(--color-border)',
                  borderRadius: '4px',
                }}
              />
            </div>

            <div>
              <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 'bold' }}>
                Track Pad
              </label>
              <input
                type="number"
                value={trackPad}
                onChange={(e) => setTrackPad(e.target.value)}
                placeholder="0"
                style={{
                  width: '100%',
                  padding: '0.5rem',
                  fontSize: '1rem',
                  border: '1px solid var(--color-border)',
                  borderRadius: '4px',
                }}
              />
              <small style={{ color: 'var(--color-text-muted)', fontSize: '0.875rem' }}>
                Offset for multi-disc
              </small>
            </div>
          </div>

          {/* Album Art */}
          {!isSingle && (
          <div style={{
            padding: '1rem',
            backgroundColor: 'var(--color-bg-surface)',
            borderRadius: '4px',
            border: '1px solid var(--color-border)'
          }}>
            <h3 style={{ fontSize: '1rem', fontWeight: 'bold', marginBottom: '0.5rem' }}>
              Album Art (Optional)
            </h3>
            <div style={{ marginBottom: '1rem' }}>
              <label style={{ display: 'block', marginBottom: '0.5rem' }}>
                Image URL
              </label>
              <input
                type="text"
                value={albumArtUrl}
                onChange={(e) => setAlbumArtUrl(e.target.value)}
                placeholder="https://example.com/cover.jpg"
                style={{
                  width: '100%',
                  padding: '0.5rem',
                  fontSize: '1rem',
                  border: '1px solid var(--color-border)',
                  borderRadius: '4px',
                }}
              />
            </div>
            <div>
              <label style={{ display: 'block', marginBottom: '0.5rem' }}>
                Save as Filename
              </label>
              <input
                type="text"
                value={albumArtName}
                onChange={(e) => setAlbumArtName(e.target.value)}
                placeholder="abbey_road.jpg"
                style={{
                  width: '100%',
                  padding: '0.5rem',
                  fontSize: '1rem',
                  border: '1px solid var(--color-border)',
                  borderRadius: '4px',
                }}
              />
            </div>
          </div>
          )}

          {/* Submit Button */}
          <button
            type="submit"
            disabled={selectedFiles.length === 0}
            style={{
              padding: '0.75rem 1.5rem',
              backgroundColor: selectedFiles.length === 0 ? 'var(--color-text-faint)' : '#3b82f6',
              color: 'white',
              border: 'none',
              borderRadius: '4px',
              fontSize: '1rem',
              cursor: selectedFiles.length === 0 ? 'not-allowed' : 'pointer',
              fontWeight: '500',
            }}
          >
            Upload Tracks
          </button>
        </div>
      </form>

      {/* Recent Uploads */}
      <div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
          <h2 style={{ fontSize: '1.25rem', fontWeight: 'bold' }}>Recent Uploads</h2>
          <div style={{ display: 'flex', gap: '0.5rem' }}>
            <button
              onClick={loadRecentUploads}
              disabled={loadingRecent}
              style={{
                padding: '0.5rem 1rem',
                backgroundColor: 'var(--color-text-muted)',
                color: 'white',
                border: 'none',
                borderRadius: '4px',
                fontSize: '0.875rem',
                cursor: loadingRecent ? 'not-allowed' : 'pointer',
              }}
            >
              {loadingRecent ? 'Refreshing...' : 'Refresh'}
            </button>
            <button
              onClick={handleClearFailed}
              disabled={noFailedUploads}
              style={{
                padding: '0.5rem 1rem',
                backgroundColor: noFailedUploads ? 'var(--color-border-strong)' : '#ef4444',
                color: 'white',
                border: 'none',
                borderRadius: '4px',
                fontSize: '0.875rem',
                cursor: noFailedUploads ? 'not-allowed' : 'pointer',
              }}
            >
              Clear All Failed
            </button>
          </div>
        </div>

        {recentUploads.length > 0 ? (
          <div style={{ overflowX: 'auto' }}>
            <table style={{
              width: '100%',
              borderCollapse: 'collapse',
              fontSize: '0.875rem',
              backgroundColor: 'var(--color-bg-surface)',
              borderRadius: '4px',
              overflow: 'hidden',
            }}>
              <thead>
                <tr style={{ backgroundColor: 'var(--color-bg-surface-muted)', borderBottom: '2px solid var(--color-border)' }}>
                  <th style={{ padding: '0.75rem', textAlign: 'left' }}>Status</th>
                  <th style={{ padding: '0.75rem', textAlign: 'left' }}>Filename</th>
                  <th style={{ padding: '0.75rem', textAlign: 'left' }}>Artist</th>
                  <th style={{ padding: '0.75rem', textAlign: 'left' }}>Album</th>
                  <th style={{ padding: '0.75rem', textAlign: 'left' }}>Created</th>
                  <th style={{ padding: '0.75rem', textAlign: 'left' }}>Error</th>
                  <th style={{ padding: '0.75rem', textAlign: 'left' }}></th>
                </tr>
              </thead>
              <tbody>
                {recentUploads.map((upload) => (
                  <tr key={upload.id} style={{ borderBottom: '1px solid var(--color-border)' }}>
                    <td style={{ padding: '0.75rem' }}>
                      <span style={{
                        padding: '0.25rem 0.5rem',
                        borderRadius: '4px',
                        fontSize: '0.75rem',
                        fontWeight: '500',
                        color: 'white',
                        backgroundColor: getStatusColor(upload.status)
                      }}>
                        {upload.status}
                      </span>
                    </td>
                    <td style={{ padding: '0.75rem' }}>{upload.original_filename}</td>
                    <td style={{ padding: '0.75rem' }}>{upload.resolved_artist_name || upload.artist_name || upload.artist_id || '-'}</td>
                    <td style={{ padding: '0.75rem' }}>
                      {upload.resolved_album_id || upload.album_id ? (
                        <Link
                          to={`/album/${upload.resolved_album_id || upload.album_id}`}
                          style={{ color: '#3b82f6' }}
                        >
                          {upload.resolved_album_title || upload.album_name || upload.album_id}
                        </Link>
                      ) : (
                        upload.resolved_album_title || upload.album_name || '-'
                      )}
                    </td>
                    <td style={{ padding: '0.75rem' }}>{formatDate(upload.created_at)}</td>
                    <td style={{ padding: '0.75rem', color: '#ef4444', fontSize: '0.75rem' }}>
                      {upload.error_message || '-'}
                    </td>
                    <td style={{ padding: '0.75rem' }}>
                      <div style={{ display: 'flex', gap: '0.5rem' }}>
                        {(upload.status === 'failed' || upload.status === 'processing') && (
                          <button
                            onClick={() => handleRetry(upload.id)}
                            style={{
                              padding: '0.35rem 0.75rem',
                              backgroundColor: '#3b82f6',
                              color: 'white',
                              border: 'none',
                              borderRadius: '4px',
                              fontSize: '0.75rem',
                              cursor: 'pointer',
                              whiteSpace: 'nowrap',
                            }}
                          >
                            Retry
                          </button>
                        )}
                        {upload.status === 'failed' && (
                          <button
                            onClick={() => handleDismiss(upload.id)}
                            style={{
                              padding: '0.35rem 0.75rem',
                              backgroundColor: 'var(--color-text-muted)',
                              color: 'white',
                              border: 'none',
                              borderRadius: '4px',
                              fontSize: '0.75rem',
                              cursor: 'pointer',
                              whiteSpace: 'nowrap',
                            }}
                          >
                            Dismiss
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div style={{
            padding: '2rem',
            textAlign: 'center',
            color: 'var(--color-text-muted)',
            backgroundColor: 'var(--color-bg-surface)',
            borderRadius: '4px'
          }}>
            No recent uploads
          </div>
        )}
      </div>

    </div>
  );
};

export default AdminUpload;

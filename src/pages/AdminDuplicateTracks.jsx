import { useState } from 'react';
import { Link } from 'react-router-dom';
import toast from 'react-hot-toast';
import { apiService } from '../services/api';
import { getErrorMessage } from '../utils/errors';
import Loading from '../components/Loading';
import Retry from '../components/Retry';
import { usePaginatedList } from '../hooks/usePaginatedList';
import Pagination from '../components/admin/Pagination';
import { formatDuration } from '../utils/formatters';

const TIER_LABELS = { 1: 'Same audio file', 2: 'Matching title' };

const pairKey = (pair) => `${pair.a.id}-${pair.b.id}`;

export default function AdminDuplicateTracks() {
  const { items: pairs, setItems: setPairs, pagination, page: currentPage, goToPage, loading, error, reload } = usePaginatedList(
    (page) => apiService.getDuplicateTracks(page, 25).then((response) => ({ items: response.data.pairs, pagination: response.data.pagination }))
  );
  const [busyKey, setBusyKey] = useState(null);
  const [previewKey, setPreviewKey] = useState(null); // track id whose <audio> is expanded, or null

  const handleMerge = async (pair, keepId, loseId, keepTitle, loseTitle) => {
    if (!window.confirm(`Delete "${loseTitle}" and keep "${keepTitle}"?\n\nThis cannot be undone.`)) return;
    const key = pairKey(pair);
    setBusyKey(key);
    try {
      await apiService.resolveDuplicateTrack(keepId, loseId);
      toast.success(`Kept "${keepTitle}", deleted "${loseTitle}".`);
      // A 3+-member duplicate group can produce multiple overlapping pairs sharing an
      // id (e.g. [t1,t2] and [t2,t3]) — drop every pair referencing either id involved
      // in this merge, not just the exact pair just resolved, since the other pair's
      // row is now stale (one of its two ids no longer exists).
      setPairs((prev) => prev.filter((p) => p.a.id !== keepId && p.a.id !== loseId && p.b.id !== keepId && p.b.id !== loseId));
    } catch (err) {
      toast.error(getErrorMessage(err, 'Failed to merge tracks'));
    } finally {
      setBusyKey(null);
    }
  };

  const handleDismiss = async (pair) => {
    const key = pairKey(pair);
    setBusyKey(key);
    try {
      await apiService.dismissDuplicate('track', pair.a.id, pair.b.id);
      setPairs((prev) => prev.filter((p) => pairKey(p) !== key));
    } catch (err) {
      toast.error(getErrorMessage(err, 'Failed to dismiss'));
    } finally {
      setBusyKey(null);
    }
  };

  if (loading && !pairs.length) return <Loading message="Loading possible duplicate tracks" />;
  if (error) return <Retry message={error.message} onRetry={reload} />;

  return (
    <div style={{ padding: '2rem', backgroundColor: 'var(--color-bg-surface-muted)', minHeight: '100%' }}>
      <h1 style={{ fontSize: '2rem', fontWeight: 'bold', color: 'var(--color-text-primary)', marginBottom: '1.5rem' }}>Possible Duplicate Tracks</h1>

      {pairs.length === 0 ? (
        <p style={{ color: 'var(--color-text-muted)' }}>No possible duplicate tracks found.</p>
      ) : (
        pairs.map((pair) => {
          const key = pairKey(pair);
          const busy = busyKey === key;
          return (
            <div key={key} style={{ backgroundColor: 'var(--color-bg-surface)', borderRadius: '0.5rem', padding: '1rem', marginBottom: '1rem', boxShadow: '0 1px 3px 0 rgba(0, 0, 0, 0.1)' }}>
              <p style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)', textTransform: 'uppercase', marginBottom: '0.5rem' }}>{TIER_LABELS[pair.tier]} — {pair.a.album_title}</p>
              <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap', alignItems: 'flex-start' }}>
                {[
                  { track: pair.a, keepId: pair.a.id, loseId: pair.b.id, loseTitle: pair.b.title },
                  { track: pair.b, keepId: pair.b.id, loseId: pair.a.id, loseTitle: pair.a.title },
                ].map(({ track, keepId, loseId, loseTitle }) => (
                  <div key={track.id} style={{ flex: '1 1 200px' }}>
                    {/* Deliberately no target="_blank" — see the matching
                        comment in AlbumCompareModal.jsx: a real new tab/
                        window on mobile either hard-navigates in place
                        (installed PWA, destroying the playing queue) or
                        opens a visually-empty second tab that looks like
                        data loss. Plain in-SPA nav leaves playback alone. */}
                    <Link to={`/album/${track.album_id}`} style={{ fontWeight: 'bold', color: '#3b82f6', textDecoration: 'none' }}>
                      {track.title}
                    </Link>
                    <p style={{ fontSize: '0.875rem', color: 'var(--color-text-muted)' }}>{formatDuration(track.duration_sec)}</p>
                    <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                      <button
                        disabled={busy}
                        onClick={() => setPreviewKey(previewKey === track.id ? null : track.id)}
                        style={{ marginTop: '0.5rem', padding: '0.4rem 0.75rem', backgroundColor: 'var(--color-border-strong)', color: 'var(--color-text-primary)', border: 'none', borderRadius: '4px', cursor: busy ? 'not-allowed' : 'pointer', fontSize: '0.8rem' }}
                      >
                        {previewKey === track.id ? 'Hide preview' : 'Preview'}
                      </button>
                      <button
                        disabled={busy}
                        onClick={() => handleMerge(pair, keepId, loseId, track.title, loseTitle)}
                        style={{ marginTop: '0.5rem', padding: '0.4rem 0.75rem', backgroundColor: '#3b82f6', color: 'white', border: 'none', borderRadius: '4px', cursor: busy ? 'not-allowed' : 'pointer', fontSize: '0.8rem' }}
                      >
                        Keep this, delete the other
                      </button>
                    </div>
                    {previewKey === track.id && (
                      <audio controls src={track.url} style={{ marginTop: '0.5rem', width: '100%', maxWidth: '260px' }} />
                    )}
                  </div>
                ))}
                <button
                  disabled={busy}
                  onClick={() => handleDismiss(pair)}
                  style={{ padding: '0.4rem 0.75rem', backgroundColor: 'var(--color-text-muted)', color: 'white', border: 'none', borderRadius: '4px', cursor: busy ? 'not-allowed' : 'pointer', fontSize: '0.8rem' }}
                >
                  Not a duplicate
                </button>
              </div>
            </div>
          );
        })
      )}

      <Pagination page={currentPage} totalPages={pagination?.totalPages} onPageChange={goToPage} />
    </div>
  );
}

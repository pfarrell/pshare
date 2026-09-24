import { useState } from 'react';
import toast from 'react-hot-toast';
import { apiService } from '../services/api';
import { getErrorMessage } from '../utils/errors';
import Loading from '../components/Loading';
import Retry from '../components/Retry';
import { usePaginatedList } from '../hooks/usePaginatedList';
import Pagination from '../components/admin/Pagination';
import AlbumCompareModal from '../components/admin/AlbumCompareModal';

const TIER_LABELS = { 1: 'Same release (MusicBrainz)', 2: 'Matching title' };

const pairKey = (pair) => `${pair.a.id}-${pair.b.id}`;

export default function AdminDuplicateAlbums() {
  const { items: pairs, setItems: setPairs, pagination, page: currentPage, goToPage, loading, error, reload } = usePaginatedList(
    (page) => apiService.getDuplicateAlbums(page, 25).then((response) => ({ items: response.data.pairs, pagination: response.data.pagination }))
  );
  const [busyKey, setBusyKey] = useState(null);
  const [comparePair, setComparePair] = useState(null); // { a, b } album ids, or null
  const [offsets, setOffsets] = useState({}); // `${pairKey}-${keepId}` -> offset input string, only once user edits away from the default

  // Defaults to the surviving (kept) album's own track count, matching the
  // offset default AlbumTransferSection's manual merge already uses elsewhere.
  const offsetKey = (pair, keepAlbum) => `${pairKey(pair)}-${keepAlbum.id}`;
  const getOffset = (pair, keepAlbum) => {
    const k = offsetKey(pair, keepAlbum);
    return offsets[k] !== undefined ? offsets[k] : String(keepAlbum.track_count ?? 0);
  };
  const setOffset = (pair, keepAlbum, value) => {
    setOffsets((prev) => ({ ...prev, [offsetKey(pair, keepAlbum)]: value }));
  };

  const handleMerge = async (pair, keepAlbum, loseAlbum) => {
    const keepId = keepAlbum.id;
    const loseId = loseAlbum.id;
    const keepTitle = keepAlbum.title;
    const loseTitle = loseAlbum.title;
    const offset = parseInt(getOffset(pair, keepAlbum)) || 0;
    if (!window.confirm(
      `Merge "${loseTitle}" into "${keepTitle}"?\n\n` +
      (offset > 0 ? `Track numbers will be incremented by ${offset}.\n\n` : 'Track numbers will not be changed.\n\n') +
      'This cannot be undone.'
    )) return;
    const key = pairKey(pair);
    setBusyKey(key);
    try {
      await apiService.resolveDuplicateAlbum(keepId, loseId, offset);
      toast.success(`Merged "${loseTitle}" into "${keepTitle}".`);
      // A 3+-member duplicate group can produce multiple overlapping pairs sharing an
      // id (e.g. [t1,t2] and [t2,t3]) — drop every pair referencing either id involved
      // in this merge, not just the exact pair just resolved, since the other pair's
      // row is now stale (one of its two ids no longer exists).
      setPairs((prev) => prev.filter((p) => p.a.id !== keepId && p.a.id !== loseId && p.b.id !== keepId && p.b.id !== loseId));
    } catch (err) {
      toast.error(getErrorMessage(err, 'Failed to merge albums'));
    } finally {
      setBusyKey(null);
    }
  };

  const handleDelete = async (pair, album) => {
    if (!window.confirm(`Delete "${album.title}" and its ${album.track_count} track${album.track_count === 1 ? '' : 's'}?\n\nThis permanently deletes the tracks and files — nothing is merged, and this cannot be undone.`)) return;
    const key = pairKey(pair);
    setBusyKey(key);
    try {
      await apiService.deleteAlbum(album.id);
      toast.success(`Deleted "${album.title}".`);
      // Same reasoning as handleMerge above: drop every pair referencing this id.
      setPairs((prev) => prev.filter((p) => p.a.id !== album.id && p.b.id !== album.id));
    } catch (err) {
      toast.error(getErrorMessage(err, 'Failed to delete album'));
    } finally {
      setBusyKey(null);
    }
  };

  const handleDismiss = async (pair) => {
    const key = pairKey(pair);
    setBusyKey(key);
    try {
      await apiService.dismissDuplicate('album', pair.a.id, pair.b.id);
      setPairs((prev) => prev.filter((p) => pairKey(p) !== key));
    } catch (err) {
      toast.error(getErrorMessage(err, 'Failed to dismiss'));
    } finally {
      setBusyKey(null);
    }
  };

  if (loading && !pairs.length) return <Loading message="Loading possible duplicate albums" />;
  if (error) return <Retry message={error.message} onRetry={reload} />;

  return (
    <div style={{ padding: '2rem', backgroundColor: 'var(--color-bg-surface-muted)', minHeight: '100%' }}>
      <h1 style={{ fontSize: '2rem', fontWeight: 'bold', color: 'var(--color-text-primary)', marginBottom: '1.5rem' }}>Possible Duplicate Albums</h1>

      {pairs.length === 0 ? (
        <p style={{ color: 'var(--color-text-muted)' }}>No possible duplicate albums found.</p>
      ) : (
        pairs.map((pair) => {
          const key = pairKey(pair);
          const busy = busyKey === key;
          return (
            <div key={key} style={{ backgroundColor: 'var(--color-bg-surface)', borderRadius: '0.5rem', padding: '1rem', marginBottom: '1rem', boxShadow: '0 1px 3px 0 rgba(0, 0, 0, 0.1)' }}>
              <p style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)', textTransform: 'uppercase', marginBottom: '0.5rem' }}>{TIER_LABELS[pair.tier]}</p>
              <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap', alignItems: 'flex-start' }}>
                {[
                  { album: pair.a, other: pair.b },
                  { album: pair.b, other: pair.a },
                ].map(({ album, other }) => (
                  <div key={album.id} style={{ flex: '1 1 200px' }}>
                    <strong>{album.title}</strong>
                    <p style={{ fontSize: '0.875rem', color: 'var(--color-text-muted)' }}>{album.artist_name}{album.release_year ? ` · ${album.release_year}` : ''} · {album.track_count} track{album.track_count === 1 ? '' : 's'}</p>
                    <div style={{ marginBottom: '0.4rem' }}>
                      <label style={{ display: 'block', fontSize: '0.75rem', color: 'var(--color-text-muted)', marginBottom: '0.2rem' }}>
                        Track # offset for incoming tracks (0 = no change)
                      </label>
                      <input
                        type="number"
                        min="0"
                        disabled={busy}
                        value={getOffset(pair, album)}
                        onChange={(e) => setOffset(pair, album, e.target.value)}
                        style={{ width: '80px', padding: '0.3rem', fontSize: '0.85rem', border: '1px solid var(--color-border)', borderRadius: '4px', backgroundColor: 'var(--color-bg-surface)', color: 'var(--color-text-primary)' }}
                      />
                    </div>
                    <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                      <button
                        disabled={busy}
                        onClick={() => handleMerge(pair, album, other)}
                        style={{ padding: '0.4rem 0.75rem', backgroundColor: '#3b82f6', color: 'white', border: 'none', borderRadius: '4px', cursor: busy ? 'not-allowed' : 'pointer', fontSize: '0.8rem' }}
                      >
                        Keep this, merge the other in
                      </button>
                      <button
                        disabled={busy}
                        onClick={() => handleDelete(pair, album)}
                        style={{ padding: '0.4rem 0.75rem', backgroundColor: '#ef4444', color: 'white', border: 'none', borderRadius: '4px', cursor: busy ? 'not-allowed' : 'pointer', fontSize: '0.8rem' }}
                      >
                        Delete
                      </button>
                    </div>
                  </div>
                ))}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                  <button
                    disabled={busy}
                    onClick={() => setComparePair({ a: pair.a.id, b: pair.b.id })}
                    style={{ padding: '0.4rem 0.75rem', backgroundColor: 'var(--color-border-strong)', color: 'var(--color-text-primary)', border: 'none', borderRadius: '4px', cursor: busy ? 'not-allowed' : 'pointer', fontSize: '0.8rem' }}
                  >
                    Compare
                  </button>
                  <button
                    disabled={busy}
                    onClick={() => handleDismiss(pair)}
                    style={{ padding: '0.4rem 0.75rem', backgroundColor: 'var(--color-text-muted)', color: 'white', border: 'none', borderRadius: '4px', cursor: busy ? 'not-allowed' : 'pointer', fontSize: '0.8rem' }}
                  >
                    Not a duplicate
                  </button>
                </div>
              </div>
            </div>
          );
        })
      )}

      <Pagination page={currentPage} totalPages={pagination?.totalPages} onPageChange={goToPage} />

      {comparePair && (
        <AlbumCompareModal idA={comparePair.a} idB={comparePair.b} onClose={() => setComparePair(null)} />
      )}
    </div>
  );
}

import { useState } from 'react';
import toast from 'react-hot-toast';
import { apiService } from '../services/api';
import { getErrorMessage } from '../utils/errors';
import Loading from '../components/Loading';
import Retry from '../components/Retry';
import { usePaginatedList } from '../hooks/usePaginatedList';
import Pagination from '../components/admin/Pagination';

const TIER_LABELS = { 1: 'Same release (MusicBrainz)', 2: 'Matching title' };

const pairKey = (pair) => `${pair.a.id}-${pair.b.id}`;

export default function AdminDuplicateAlbums() {
  const { items: pairs, setItems: setPairs, pagination, page: currentPage, goToPage, loading, error, reload } = usePaginatedList(
    (page) => apiService.getDuplicateAlbums(page, 25).then((response) => ({ items: response.data.pairs, pagination: response.data.pagination }))
  );
  const [busyKey, setBusyKey] = useState(null);

  const handleMerge = async (pair, keepId, loseId, keepTitle, loseTitle) => {
    if (!window.confirm(`Merge "${loseTitle}" into "${keepTitle}"?\n\nThis cannot be undone.`)) return;
    const key = pairKey(pair);
    setBusyKey(key);
    try {
      await apiService.resolveDuplicateAlbum(keepId, loseId);
      toast.success(`Merged "${loseTitle}" into "${keepTitle}".`);
      setPairs((prev) => prev.filter((p) => pairKey(p) !== key));
    } catch (err) {
      toast.error(getErrorMessage(err, 'Failed to merge albums'));
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
                <div style={{ flex: '1 1 200px' }}>
                  <strong>{pair.a.title}</strong>
                  <p style={{ fontSize: '0.875rem', color: 'var(--color-text-muted)' }}>{pair.a.artist_name}{pair.a.release_year ? ` · ${pair.a.release_year}` : ''}</p>
                  <button
                    disabled={busy}
                    onClick={() => handleMerge(pair, pair.a.id, pair.b.id, pair.a.title, pair.b.title)}
                    style={{ marginTop: '0.5rem', padding: '0.4rem 0.75rem', backgroundColor: '#3b82f6', color: 'white', border: 'none', borderRadius: '4px', cursor: busy ? 'not-allowed' : 'pointer', fontSize: '0.8rem' }}
                  >
                    Keep this, merge the other in
                  </button>
                </div>
                <div style={{ flex: '1 1 200px' }}>
                  <strong>{pair.b.title}</strong>
                  <p style={{ fontSize: '0.875rem', color: 'var(--color-text-muted)' }}>{pair.b.artist_name}{pair.b.release_year ? ` · ${pair.b.release_year}` : ''}</p>
                  <button
                    disabled={busy}
                    onClick={() => handleMerge(pair, pair.b.id, pair.a.id, pair.b.title, pair.a.title)}
                    style={{ marginTop: '0.5rem', padding: '0.4rem 0.75rem', backgroundColor: '#3b82f6', color: 'white', border: 'none', borderRadius: '4px', cursor: busy ? 'not-allowed' : 'pointer', fontSize: '0.8rem' }}
                  >
                    Keep this, merge the other in
                  </button>
                </div>
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

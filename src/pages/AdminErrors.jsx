// src/pages/AdminErrors.jsx
import { apiService } from '../services/api';
import Loading from '../components/Loading';
import Retry from '../components/Retry';
import { usePaginatedList } from '../hooks/usePaginatedList';
import Pagination from '../components/admin/Pagination';

const SOURCE_COLORS = {
  upload: { bg: '#fee2e2', color: '#991b1b' },
  http: { bg: '#ede9fe', color: '#5b21b6' },
  musicbrainz: { bg: '#dbeafe', color: '#1e40af' },
  cover_art_archive: { bg: '#dbeafe', color: '#1e40af' },
  wikipedia: { bg: '#e0f2fe', color: '#075985' },
  fanart: { bg: '#fce7f3', color: '#9d174d' },
  lastfm: { bg: '#fef3c7', color: '#92400e' },
  listenbrainz: { bg: '#d1fae5', color: '#065f46' },
};

const getSourceColors = (source) => SOURCE_COLORS[source] || { bg: 'var(--color-border)', color: 'var(--color-text-secondary)' };

export default function AdminErrors() {
  const { items: errors, setItems: setErrors, pagination, page: currentPage, goToPage, loading, error, reload } = usePaginatedList(
    (page) => apiService.getErrors(page, 25).then((response) => ({ items: response.data.errors, pagination: response.data.pagination }))
  );

  const formatDate = (dateString) => {
    if (!dateString) return 'N/A';
    return new Date(dateString).toLocaleString('en-US', {
      month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit',
    });
  };

  const handleDismiss = async (id) => {
    try {
      await apiService.dismissError(id);
      setErrors((prev) => prev.filter((e) => e.id !== id));
    } catch (err) {
      console.error('Failed to dismiss error:', err);
    }
  };


  if (loading && !errors.length) return <Loading message="Loading errors" />;
  if (error) return <Retry message={error.message} onRetry={reload} />;

  return (
    <div style={{ padding: '2rem', backgroundColor: 'var(--color-bg-surface-muted)', minHeight: '100%' }}>
      <div style={{ marginBottom: '2rem' }}>
        <h1 style={{ fontSize: '2rem', fontWeight: 'bold', color: 'var(--color-text-primary)' }}>Errors</h1>
        {pagination && (
          <p style={{ color: 'var(--color-text-muted)', marginTop: '0.5rem' }}>
            Showing {((pagination.page - 1) * pagination.limit) + 1} - {Math.min(pagination.page * pagination.limit, pagination.total)} of {pagination.total.toLocaleString()} entries
          </p>
        )}
      </div>

      <div style={{ backgroundColor: 'var(--color-bg-surface)', borderRadius: '0.5rem', boxShadow: '0 1px 3px 0 rgba(0, 0, 0, 0.1)', overflow: 'hidden' }}>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ backgroundColor: 'var(--color-bg-surface)', borderBottom: '1px solid var(--color-border)' }}>
                <th style={{ padding: '0.75rem 1rem', textAlign: 'left', fontWeight: '600', fontSize: '0.75rem', color: 'var(--color-text-muted)', textTransform: 'uppercase' }}>Source</th>
                <th style={{ padding: '0.75rem 1rem', textAlign: 'left', fontWeight: '600', fontSize: '0.75rem', color: 'var(--color-text-muted)', textTransform: 'uppercase' }}>Message</th>
                <th style={{ padding: '0.75rem 1rem', textAlign: 'left', fontWeight: '600', fontSize: '0.75rem', color: 'var(--color-text-muted)', textTransform: 'uppercase' }}>Context</th>
                <th style={{ padding: '0.75rem 1rem', textAlign: 'left', fontWeight: '600', fontSize: '0.75rem', color: 'var(--color-text-muted)', textTransform: 'uppercase' }}>Date/Time</th>
                <th style={{ padding: '0.75rem 1rem', textAlign: 'left', fontWeight: '600', fontSize: '0.75rem', color: 'var(--color-text-muted)', textTransform: 'uppercase' }}></th>
              </tr>
            </thead>
            <tbody>
              {errors.length === 0 ? (
                <tr>
                  <td colSpan="5" style={{ padding: '2rem', textAlign: 'center', color: 'var(--color-text-muted)' }}>No errors logged</td>
                </tr>
              ) : (
                errors.map((entry) => {
                  const colors = getSourceColors(entry.source);
                  return (
                    <tr key={entry.id} style={{ borderBottom: '1px solid var(--color-border)' }}>
                      <td style={{ padding: '0.75rem 1rem', fontSize: '0.875rem' }}>
                        <span style={{ padding: '0.25rem 0.5rem', borderRadius: '0.25rem', backgroundColor: colors.bg, color: colors.color, fontSize: '0.75rem', fontWeight: '500' }}>
                          {entry.source}
                        </span>
                      </td>
                      <td style={{ padding: '0.75rem 1rem', fontSize: '0.875rem', color: 'var(--color-text-primary)' }}>{entry.message}</td>
                      <td style={{ padding: '0.75rem 1rem', fontSize: '0.875rem', color: 'var(--color-text-muted)' }}>{entry.context || '-'}</td>
                      <td style={{ padding: '0.75rem 1rem', fontSize: '0.875rem', color: 'var(--color-text-primary)', whiteSpace: 'nowrap' }}>{formatDate(entry.created_at)}</td>
                      <td style={{ padding: '0.75rem 1rem' }}>
                        <button
                          onClick={() => handleDismiss(entry.id)}
                          style={{ padding: '0.35rem 0.75rem', backgroundColor: 'var(--color-text-muted)', color: 'white', border: 'none', borderRadius: '4px', fontSize: '0.75rem', cursor: 'pointer', whiteSpace: 'nowrap' }}
                        >
                          Dismiss
                        </button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      <Pagination page={currentPage} totalPages={pagination?.totalPages} onPageChange={goToPage} />
    </div>
  );
}

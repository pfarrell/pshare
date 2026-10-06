// src/pages/AdminFactoids.jsx
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { apiService } from '../services/api';
import Loading from '../components/Loading';
import Retry from '../components/Retry';
import { usePaginatedList } from '../hooks/usePaginatedList';
import Pagination from '../components/admin/Pagination';

// Global review list for the auto-published factoids: read the recent ones,
// delete the wrong or dull ones. Re-researching an entity stays on the
// per-entity panel (FactoidsPanel on the admin artist/album pages).

const PAGE_SIZE = 25;

// A stored source_url becomes a live link here, so the row is not trusted: the
// backend only stores https urls, but a javascript: or data: href would run in
// an admin session.
const isHttps = (url) => {
  try {
    return new URL(url).protocol === 'https:';
  } catch {
    return false;
  }
};

const formatDate = (value) => {
  if (!value) return 'N/A';
  return new Date(value).toLocaleString('en-US', {
    month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit',
  });
};

const th = { padding: '0.75rem 1rem', textAlign: 'left', fontWeight: '600', fontSize: '0.75rem', color: 'var(--color-text-muted)', textTransform: 'uppercase' };
const td = { padding: '0.75rem 1rem', fontSize: '0.875rem', color: 'var(--color-text-primary)', verticalAlign: 'top' };
const controlStyle = {
  padding: '0.5rem 0.75rem', borderRadius: '0.25rem', border: '1px solid var(--color-border)',
  backgroundColor: 'var(--color-bg-surface)', color: 'var(--color-text-primary)', fontSize: '0.875rem',
};

const adminPath = (link) => `/admin/${link.kind}/${link.id}`;

// Keyed by the active filters in the parent, so changing a filter remounts this
// and starts again from page 1 instead of carrying a stale page number over.
const FactoidList = ({ kind, q }) => {
  const { items, setItems, pagination, page, goToPage, loading, error, reload } = usePaginatedList(
    (p) => apiService.adminListAllFactoids(p, PAGE_SIZE, kind, q)
      .then((response) => ({ items: response.data.factoids, pagination: response.data.pagination }))
  );
  // A failed delete is reported inline and leaves the list alone: the list must
  // not lie about which factoids still exist.
  const [actionError, setActionError] = useState(null);

  const handleDelete = async (id) => {
    setActionError(null);
    try {
      await apiService.adminDeleteFactoid(id);
      setItems((rows) => rows.filter((r) => r.id !== id));
      reload();
    } catch {
      setActionError('Could not delete that factoid.');
    }
  };

  if (loading && !items.length) return <Loading />;
  if (error) return <Retry message="Could not load factoids." onRetry={reload} />;

  return (
    <>
      {pagination && (
        <p style={{ color: 'var(--color-text-muted)', margin: '0 0 1rem' }}>
          {pagination.total.toLocaleString()} {pagination.total === 1 ? 'factoid' : 'factoids'}
        </p>
      )}
      {actionError && <p role="alert" style={{ color: '#ef4444', marginBottom: '1rem' }}>{actionError}</p>}

      <div style={{ backgroundColor: 'var(--color-bg-surface)', borderRadius: '0.5rem', boxShadow: '0 1px 3px 0 rgba(0, 0, 0, 0.1)', overflow: 'hidden' }}>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ borderBottom: '1px solid var(--color-border)' }}>
                <th style={th}>Subject</th>
                <th style={th}>Kind</th>
                <th style={th}>Fact</th>
                <th style={th}>Source</th>
                <th style={th}>Model</th>
                <th style={th}>Created</th>
                <th style={th}><span style={{ position: 'absolute', left: '-9999px' }}>Actions</span></th>
              </tr>
            </thead>
            <tbody>
              {items.length === 0 ? (
                <tr>
                  <td colSpan="7" style={{ padding: '2rem', textAlign: 'center', color: 'var(--color-text-muted)' }}>
                    No factoids found
                  </td>
                </tr>
              ) : (
                items.map((f) => (
                  <tr key={f.id} style={{ borderBottom: '1px solid var(--color-border)' }}>
                    <td style={td}>
                      {typeof f.subject === 'string' && f.subject ? (
                        f.link ? (
                          <Link to={adminPath(f.link)} style={{ color: '#3b82f6', textDecoration: 'none' }}>{f.subject}</Link>
                        ) : f.subject
                      ) : (
                        <span style={{ color: 'var(--color-text-muted)', fontStyle: 'italic' }}>(subject deleted)</span>
                      )}
                      {typeof f.by === 'string' && f.by && (
                        <div style={{ color: 'var(--color-text-muted)', fontSize: '0.75rem' }}>by {f.by}</div>
                      )}
                    </td>
                    <td style={td}>{f.kind}</td>
                    <td style={{ ...td, minWidth: '16rem' }}>{typeof f.text === 'string' ? f.text : ''}</td>
                    <td style={td}>
                      {typeof f.source_url === 'string' && isHttps(f.source_url) ? (
                        <a href={f.source_url} target="_blank" rel="noreferrer" style={{ color: '#3b82f6' }}>
                          {typeof f.source_title === 'string' && f.source_title ? f.source_title : new URL(f.source_url).hostname}
                        </a>
                      ) : (
                        <span style={{ color: 'var(--color-text-muted)' }}>
                          {typeof f.source_title === 'string' && f.source_title ? f.source_title : '-'}
                        </span>
                      )}
                    </td>
                    <td style={{ ...td, color: 'var(--color-text-muted)', fontFamily: 'monospace', fontSize: '0.75rem' }}>{f.model}</td>
                    <td style={{ ...td, whiteSpace: 'nowrap' }}>{formatDate(f.created_at)}</td>
                    <td style={td}>
                      <button type="button" onClick={() => handleDelete(f.id)}>Delete</button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      <Pagination page={page} totalPages={pagination?.totalPages} onPageChange={goToPage} />
    </>
  );
};

export default function AdminFactoids() {
  // `draft` is what is typed; `q` is what was submitted. Searching on every
  // keystroke would refetch (and remount the list) per character.
  const [kind, setKind] = useState('');
  const [draft, setDraft] = useState('');
  const [q, setQ] = useState('');

  return (
    <div style={{ padding: '2rem', backgroundColor: 'var(--color-bg-surface-muted)', minHeight: '100%' }}>
      <h1 style={{ fontSize: '2rem', fontWeight: 'bold', color: 'var(--color-text-primary)', marginBottom: '1rem' }}>
        Factoids
      </h1>

      <form
        role="search"
        onSubmit={(e) => { e.preventDefault(); setQ(draft.trim()); }}
        style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem', alignItems: 'center', marginBottom: '1rem' }}
      >
        <label htmlFor="factoid-kind" style={{ color: 'var(--color-text-muted)', fontSize: '0.875rem' }}>Kind</label>
        <select id="factoid-kind" value={kind} onChange={(e) => setKind(e.target.value)} style={controlStyle}>
          <option value="">All</option>
          <option value="artist">Artist</option>
          <option value="album">Album</option>
          <option value="track">Track</option>
        </select>
        <input
          type="search"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder="Search fact text"
          aria-label="Search fact text"
          style={{ ...controlStyle, flex: '1 1 14rem', minWidth: 0 }}
        />
        <button type="submit" style={controlStyle}>Search</button>
      </form>

      <FactoidList key={`${kind}|${q}`} kind={kind} q={q} />
    </div>
  );
}

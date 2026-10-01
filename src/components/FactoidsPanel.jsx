// src/components/FactoidsPanel.jsx
import { useCallback, useEffect, useState } from 'react';
import { apiService } from '../services/api';

// Admin moderation for auto-published factoids: delete the wrong or dull ones,
// and clear the ledger row to have the worker research the entity again.
// Lives on the AdminArtist/AdminAlbum pages rather than its own admin page:
// when you notice a bad factoid you are already one tap from the entity.

// This panel is the one place a stored source_url becomes a live link. The
// backend only stores https urls, but a javascript: or data: href would run in
// an admin session, so the rendered link does not trust the row.
const isHttps = (url) => {
  try {
    return new URL(url).protocol === 'https:';
  } catch {
    return false;
  }
};

const FactoidsPanel = ({ kind, targetId }) => {
  const [factoids, setFactoids] = useState([]);
  const [generation, setGeneration] = useState(null);
  const [loadFailed, setLoadFailed] = useState(false);
  // A failed delete or re-research is reported inline and leaves the list
  // alone: replacing the list with an error would hide which factoids still
  // exist, and the list must not lie about what a failed delete did.
  const [actionError, setActionError] = useState(null);

  const load = useCallback(async () => {
    if (targetId == null) return;
    try {
      const res = await apiService.adminListFactoids(kind, targetId);
      setFactoids(res?.data?.factoids ?? []);
      setGeneration(res?.data?.generation ?? null);
      setLoadFailed(false);
    } catch {
      setLoadFailed(true);
    }
  }, [kind, targetId]);

  useEffect(() => { load(); }, [load]);

  const handleDelete = async (id) => {
    setActionError(null);
    try {
      await apiService.adminDeleteFactoid(id);
      setFactoids((rows) => rows.filter((r) => r.id !== id));
    } catch {
      setActionError('Could not delete that factoid.');
    }
  };

  const handleReresearch = async () => {
    setActionError(null);
    try {
      await apiService.adminClearFactoidGeneration(kind, targetId);
      await load();
    } catch {
      setActionError('Could not queue this for research again.');
    }
  };

  if (loadFailed) {
    return (
      <div className="factoids-panel">
        <h3>Factoids</h3>
        <p>Could not load factoids.</p>
        <button type="button" onClick={load}>Retry</button>
      </div>
    );
  }

  return (
    <div className="factoids-panel">
      <h3>Factoids</h3>
      {generation && (
        <p className="factoids-panel-status">
          Research status: {generation.status ?? 'unknown'}
          {generation.attempts > 1 ? ` after ${generation.attempts} attempts` : ''}
          {generation.error ? `: ${generation.error}` : ''}
        </p>
      )}
      {actionError && <p className="factoids-panel-error" role="alert">{actionError}</p>}
      {factoids.length === 0 ? (
        <p>No factoids yet for this {kind}.</p>
      ) : (
        <ul className="factoids-panel-list">
          {factoids.map((f) => (
            <li key={f.id}>
              <p>{typeof f?.text === 'string' ? f.text : ''}</p>
              {typeof f?.source_url === 'string' && isHttps(f.source_url) && (
                <a href={f.source_url} target="_blank" rel="noreferrer">
                  {typeof f?.source_title === 'string' && f.source_title ? f.source_title : f.source_url}
                </a>
              )}
              <button type="button" onClick={() => handleDelete(f.id)}>Delete</button>
            </li>
          ))}
        </ul>
      )}
      <button type="button" onClick={handleReresearch}>Research again</button>
    </div>
  );
};

export default FactoidsPanel;

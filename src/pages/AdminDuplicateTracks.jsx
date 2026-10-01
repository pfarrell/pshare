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

const REASON_LABELS = {
  file: 'same audio file',
  md5: 'identical file contents',
  chromaprint: 'same audio fingerprint',
  musicbrainz: 'same MusicBrainz recording',
  title: 'matching title',
};

const groupKey = (group) => group.tracks.map((t) => t.id).join('-');

const buttonStyle = (bg, busy) => ({
  padding: '0.4rem 0.75rem', backgroundColor: bg, color: 'white', border: 'none', borderRadius: '4px',
  cursor: busy ? 'not-allowed' : 'pointer', fontSize: '0.8rem',
});

export default function AdminDuplicateTracks() {
  const { items: groups, setItems: setGroups, pagination, page: currentPage, goToPage, loading, error, reload } = usePaginatedList(
    (page) => apiService.getDuplicateTracks(page, 25).then((response) => ({ items: response.data.groups, pagination: response.data.pagination }))
  );
  const [busyKey, setBusyKey] = useState(null);
  const [previewId, setPreviewId] = useState(null); // track id whose <audio> is expanded, or null

  const handleKeep = async (group, keep) => {
    const losers = group.tracks.filter((t) => t.id !== keep.id);
    const others = losers.length === 1 ? `"${losers[0].title}"` : `${losers.length} other versions`;
    if (!window.confirm(`Keep "${keep.title}" and delete ${others}?\n\nThis cannot be undone.`)) return;
    const key = groupKey(group);
    setBusyKey(key);
    try {
      await apiService.resolveDuplicateTrackGroup(keep.id, losers.map((t) => t.id));
      toast.success(`Kept "${keep.title}", deleted ${losers.length} duplicate${losers.length === 1 ? '' : 's'}.`);
      setGroups((prev) => prev.filter((g) => groupKey(g) !== key));
    } catch (err) {
      toast.error(getErrorMessage(err, 'Failed to merge tracks'));
    } finally {
      setBusyKey(null);
    }
  };

  // Dismisses `track` against every other member, so it drops out of the group
  // while the rest stay grouped. A group left with one track is no longer a duplicate.
  const handleNotDuplicate = async (group, track) => {
    const key = groupKey(group);
    setBusyKey(key);
    try {
      const others = group.tracks.filter((t) => t.id !== track.id);
      await Promise.all(others.map((o) => apiService.dismissDuplicate('track', track.id, o.id)));
      setGroups((prev) => prev.flatMap((g) => {
        if (groupKey(g) !== key) return [g];
        const remaining = g.tracks.filter((t) => t.id !== track.id);
        return remaining.length > 1 ? [{ ...g, tracks: remaining }] : [];
      }));
    } catch (err) {
      toast.error(getErrorMessage(err, 'Failed to dismiss'));
    } finally {
      setBusyKey(null);
    }
  };

  if (loading && !groups.length) return <Loading message="Loading possible duplicate tracks" />;
  if (error) return <Retry message={error.message} onRetry={reload} />;

  return (
    <div style={{ padding: '2rem', backgroundColor: 'var(--color-bg-surface-muted)', minHeight: '100%' }}>
      <h1 style={{ fontSize: '2rem', fontWeight: 'bold', color: 'var(--color-text-primary)', marginBottom: '1.5rem' }}>Possible Duplicate Tracks</h1>

      {groups.length === 0 ? (
        <p style={{ color: 'var(--color-text-muted)' }}>No possible duplicate tracks found.</p>
      ) : (
        groups.map((group) => {
          const key = groupKey(group);
          const busy = busyKey === key;
          return (
            <div key={key} style={{ backgroundColor: 'var(--color-bg-surface)', borderRadius: '0.5rem', padding: '1rem', marginBottom: '1rem', boxShadow: '0 1px 3px 0 rgba(0, 0, 0, 0.1)' }}>
              <p style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)', textTransform: 'uppercase', marginBottom: '0.5rem' }}>
                {group.tracks.length} versions - {group.album_title} - matched by {group.reasons.map((r) => REASON_LABELS[r] ?? r).join(', ')}
              </p>
              <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap', alignItems: 'flex-start' }}>
                {group.tracks.map((track) => (
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
                    <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', marginTop: '0.5rem' }}>
                      <button
                        disabled={busy}
                        onClick={() => setPreviewId(previewId === track.id ? null : track.id)}
                        style={{ ...buttonStyle('var(--color-border-strong)', busy), color: 'var(--color-text-primary)' }}
                      >
                        {previewId === track.id ? 'Hide preview' : 'Preview'}
                      </button>
                      <button disabled={busy} onClick={() => handleKeep(group, track)} style={buttonStyle('#3b82f6', busy)}>
                        Keep this one
                      </button>
                      <button disabled={busy} onClick={() => handleNotDuplicate(group, track)} style={buttonStyle('var(--color-text-muted)', busy)}>
                        Not a duplicate
                      </button>
                    </div>
                    {previewId === track.id && (
                      <audio controls src={track.url} style={{ marginTop: '0.5rem', width: '100%', maxWidth: '260px' }} />
                    )}
                  </div>
                ))}
              </div>
            </div>
          );
        })
      )}

      <Pagination page={currentPage} totalPages={pagination?.totalPages} onPageChange={goToPage} />
    </div>
  );
}

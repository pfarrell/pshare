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

// Comparing versions by ear means one at a time: starting a preview stops the others.
//
// Pausing is not enough. A paused <audio> keeps its HTTP connection open and keeps
// buffering, and a browser allows only ~6 connections per host over plain HTTP/1.1 (the
// LAN address), shared with the rest of the app. A handful of paused previews used them
// all up and playback stalled. load() aborts the download and resets the element; with
// preload="none" it then fetches nothing until play is pressed again (from the start).
const pauseOtherPreviews = (event) => {
  document.querySelectorAll('audio[data-dup-preview]').forEach((el) => {
    if (el === event.currentTarget) return;
    el.pause();
    const started = el.readyState > 0 || el.networkState === HTMLMediaElement.NETWORK_LOADING;
    if (started) el.load();
  });
};

const groupKey = (group) => group.tracks.map((t) => t.id).join('-');

// What is wrong with a track's audio, if anything. The server checks each file on disk
// (media_files.file_missing is almost never set, so it can't be trusted); `playFailed` is
// the browser telling us the player itself could not load the stream.
const FILE_PROBLEMS = {
  missing: 'FILE MISSING on disk',
  empty: 'FILE IS EMPTY (0 bytes)',
  unreadable: 'FILE UNREADABLE (storage error)',
  none: 'NO MEDIA FILE',
};
const fileProblem = (track, playFailed) => {
  if (FILE_PROBLEMS[track.file_status]) return FILE_PROBLEMS[track.file_status];
  if (playFailed.has(track.id)) return 'Preview failed to load (the file is on disk but the browser could not play it)';
  return null;
};

const buttonStyle = (bg, disabled) => ({
  padding: '0.4rem 0.75rem', backgroundColor: bg, color: 'white', border: 'none', borderRadius: '4px',
  cursor: disabled ? 'not-allowed' : 'pointer', fontSize: '0.8rem', opacity: disabled ? 0.55 : 1,
});

export default function AdminDuplicateTracks() {
  const { items: groups, setItems: setGroups, pagination, page: currentPage, goToPage, loading, error, reload } = usePaginatedList(
    (page) => apiService.getDuplicateTracks(page, 25).then((response) => ({ items: response.data.groups, pagination: response.data.pagination }))
  );
  const [busyKey, setBusyKey] = useState(null);
  // Checked tracks, by id. The button you click names the main version; the action applies
  // to the OTHER checked tracks only, and unchecked tracks stay in the group untouched.
  const [selected, setSelected] = useState(() => new Set());
  // Tracks whose <audio> reported an error this session.
  const [playFailed, setPlayFailed] = useState(() => new Set());
  const setPlayState = (id, failed) => setPlayFailed((prev) => {
    if (prev.has(id) === failed) return prev;
    const next = new Set(prev);
    if (failed) next.add(id);
    else next.delete(id);
    return next;
  });

  const toggleSelected = (id) => setSelected((prev) => {
    const next = new Set(prev);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    return next;
  });
  const setGroupSelected = (group, on) => setSelected((prev) => {
    const next = new Set(prev);
    group.tracks.forEach((t) => (on ? next.add(t.id) : next.delete(t.id)));
    return next;
  });
  const deselect = (ids) => setSelected((prev) => {
    const next = new Set(prev);
    ids.forEach((id) => next.delete(id));
    return next;
  });
  const selectedOthers = (group, main) => group.tracks.filter((t) => selected.has(t.id) && t.id !== main.id);

  // A group still needs review while two or more of its tracks do not share one media file.
  const stillPending = (tracks) => {
    const files = new Set(tracks.map((t) => t.media_file_id));
    return tracks.length > 1 && !(files.size === 1 && !files.has(null));
  };

  // A group has two different possible ends, and they are separate buttons on purpose.
  //
  // Consolidate: nothing is deleted. Every checked track stays on its album and is pointed
  // at the clicked track's media file, which becomes the definitive one.
  const handleUseFile = async (group, main) => {
    const others = selectedOthers(group, main);
    if (others.length === 0 || fileProblem(main, playFailed)) return;
    const names = others.length === 1 ? `"${others[0].title}"` : `${others.length} selected tracks`;
    if (!window.confirm(`Consolidate: use the audio file of "${main.title}" as the definitive file for ${names}?\n\nNo tracks are removed from the album.`)) return;
    const key = groupKey(group);
    setBusyKey(key);
    try {
      await apiService.setCanonicalTrackFile(main.id, others.map((t) => t.id));
      toast.success(`${others.length} track${others.length === 1 ? ' now uses' : 's now use'} the file from "${main.title}".`);
      // Consolidated tracks are done, so they leave the group right away (no reload). The
      // main version and the unchecked tracks stay, so the group can still be worked: for
      // example removing real duplicates from it afterwards. A group left with nothing to
      // compare goes away entirely.
      const moved = new Set(others.map((t) => t.id));
      setGroups((prev) => prev.flatMap((g) => {
        if (groupKey(g) !== key) return [g];
        const remaining = g.tracks.filter((t) => !moved.has(t.id));
        return stillPending(remaining)
          ? [{ ...g, tracks: remaining, album_ids: [...new Set(remaining.map((t) => t.album_id))] }]
          : [];
      }));
      others.forEach((t) => setPlayState(t.id, false));
      deselect(others.map((t) => t.id));
    } catch (err) {
      toast.error(getErrorMessage(err, 'Failed to update tracks'));
    } finally {
      setBusyKey(null);
    }
  };

  // Remove: deletes the checked tracks on the SAME ALBUM as the clicked one. The same
  // recording on a different release belongs to that release, so those are only ever
  // consolidated, never deleted (the server enforces this too).
  const handleRemoveOthers = async (group, main) => {
    const picked = selectedOthers(group, main);
    const others = picked.filter((t) => t.album_id === main.album_id);
    if (others.length === 0) return;
    const names = others.length === 1 ? `"${others[0].title}"` : `${others.length} selected tracks`;
    const skipped = picked.length - others.length;
    const skippedNote = skipped > 0 ? `\n\n${skipped} selected track${skipped === 1 ? ' is' : 's are'} on other albums and will be left alone.` : '';
    if (!window.confirm(`REMOVE ${names} from this album and keep "${main.title}"?\n\nThe removed tracks are deleted. Their playlist entries, favorites, notes and tags move to "${main.title}". This cannot be undone.${skippedNote}`)) return;
    const key = groupKey(group);
    setBusyKey(key);
    try {
      await apiService.removeOtherDuplicateTracks(main.id, others.map((t) => t.id));
      toast.success(`Removed ${others.length} track${others.length === 1 ? '' : 's'}, kept "${main.title}".`);
      // Everything not removed stays in the group while it still needs review.
      const removed = new Set(others.map((t) => t.id));
      setGroups((prev) => prev.flatMap((g) => {
        if (groupKey(g) !== key) return [g];
        const remaining = g.tracks.filter((t) => !removed.has(t.id));
        return stillPending(remaining) ? [{ ...g, tracks: remaining, album_ids: [...new Set(remaining.map((t) => t.album_id))] }] : [];
      }));
      deselect(others.map((t) => t.id));
    } catch (err) {
      toast.error(getErrorMessage(err, 'Failed to remove tracks'));
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
      deselect([track.id]);
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
      <h1 style={{ fontSize: '2rem', fontWeight: 'bold', color: 'var(--color-text-primary)', marginBottom: '0.5rem' }}>Possible Duplicate Tracks</h1>
      <p style={{ color: 'var(--color-text-muted)', fontSize: '0.875rem', marginBottom: '1.5rem' }}>
        Check the versions to act on, then click a button on the version you want as the main one. Unchecked versions are left alone.
      </p>

      {groups.length === 0 ? (
        <p style={{ color: 'var(--color-text-muted)' }}>No possible duplicate tracks found.</p>
      ) : (
        groups.map((group) => {
          const key = groupKey(group);
          const busy = busyKey === key;
          const selectedCount = group.tracks.filter((t) => selected.has(t.id)).length;
          return (
            <div key={key} style={{ backgroundColor: 'var(--color-bg-surface)', borderRadius: '0.5rem', padding: '0.75rem 1rem', marginBottom: '1rem', boxShadow: '0 1px 3px 0 rgba(0, 0, 0, 0.1)' }}>
              <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap', alignItems: 'center', marginBottom: '0.25rem' }}>
                <p style={{ flex: '1 1 260px', fontSize: '0.75rem', color: 'var(--color-text-muted)', textTransform: 'uppercase' }}>
                  {group.tracks.length} versions - {group.album_ids.length > 1 ? `across ${group.album_ids.length} albums` : group.tracks[0].album_title} - matched by {group.reasons.map((r) => REASON_LABELS[r] ?? r).join(', ')}
                </p>
                <span style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)' }}>{selectedCount} selected</span>
                <button
                  disabled={busy}
                  onClick={() => setGroupSelected(group, selectedCount !== group.tracks.length)}
                  style={{ ...buttonStyle('var(--color-border-strong)', busy), color: 'var(--color-text-primary)' }}
                >
                  {selectedCount === group.tracks.length ? 'Clear selection' : 'Select all'}
                </button>
              </div>

              <div role="list">
                {group.tracks.map((track, index) => {
                  const others = selectedOthers(group, track);
                  const removable = others.filter((t) => t.album_id === track.album_id).length;
                  // A broken file must not become the definitive one: the other tracks would
                  // stop playing too. Consolidating onto a working file is how they get fixed.
                  const problem = fileProblem(track, playFailed);
                  const consolidateDisabled = busy || !!problem || others.length === 0;
                  const removeDisabled = busy || removable === 0;
                  return (
                    <div
                      key={track.id}
                      role="listitem"
                      data-track-row
                      data-file-problem={problem ? 'true' : undefined}
                      style={{
                        display: 'flex', gap: '0.75rem 1rem', flexWrap: 'wrap', alignItems: 'center', padding: '0.6rem 0.5rem',
                        borderTop: index === 0 ? 'none' : '1px solid var(--color-border-strong)',
                        ...(problem ? { backgroundColor: 'rgba(220, 38, 38, 0.14)', borderLeft: '4px solid #dc2626' } : { borderLeft: '4px solid transparent' }),
                      }}
                    >
                      <input
                        type="checkbox"
                        aria-label={`Select ${track.title}`}
                        checked={selected.has(track.id)}
                        disabled={busy}
                        onChange={() => toggleSelected(track.id)}
                        style={{ width: '1.1rem', height: '1.1rem', flex: '0 0 auto' }}
                      />
                      <div style={{ flex: '2 1 240px', minWidth: 0 }}>
                        {/* Deliberately no target="_blank" — see the matching
                            comment in AlbumCompareModal.jsx: a real new tab/
                            window on mobile either hard-navigates in place
                            (installed PWA, destroying the playing queue) or
                            opens a visually-empty second tab that looks like
                            data loss. Plain in-SPA nav leaves playback alone. */}
                        <Link to={`/album/${track.album_id}`} style={{ fontWeight: 'bold', color: '#3b82f6', textDecoration: 'none' }}>
                          {track.title}
                        </Link>
                        <p style={{ fontSize: '0.8rem', color: 'var(--color-text-muted)' }}>
                          Album:{' '}
                          <Link to={`/album/${track.album_id}`} style={{ color: '#3b82f6', textDecoration: 'none' }}>
                            {track.album_title || 'Untitled album'}
                          </Link>
                          {track.album_artist ? ` by ${track.album_artist}` : ''} (album #{track.album_id})
                          {' · '}{formatDuration(track.duration_sec)} · file #{track.media_file_id ?? 'none'}
                        </p>
                        {problem && (
                          <p role="alert" style={{ fontSize: '0.8rem', fontWeight: 'bold', color: '#dc2626', overflowWrap: 'anywhere' }}>
                            {problem}
                            {track.file_path ? <span style={{ fontWeight: 'normal' }}>{': '}{track.file_path}</span> : null}
                          </p>
                        )}
                      </div>
                      {/* preload="none": nothing downloads until play is pressed, so a
                          page full of players costs no bandwidth. */}
                      <audio
                        // remounts when the track is pointed at a different file, so a stale
                        // load error from the old (broken) file does not stick
                        key={`${track.id}-${track.media_file_id}`}
                        controls
                        preload="none"
                        data-dup-preview
                        src={track.url}
                        onPlay={pauseOtherPreviews}
                        onError={() => setPlayState(track.id, true)}
                        onPlaying={() => setPlayState(track.id, false)}
                        style={{ flex: '1 1 220px', minWidth: 0, maxWidth: '300px' }}
                      />
                      <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', flex: '0 1 auto' }}>
                        <button
                          disabled={consolidateDisabled}
                          title={problem
                            ? `This version can't be the main one: ${problem}. Pick a version that plays.`
                            : others.length === 0
                              ? 'Check the other versions to point at this track\'s audio file. No tracks are removed.'
                              : 'Point the checked versions at this track\'s audio file. No tracks are removed.'}
                          onClick={() => handleUseFile(group, track)}
                          style={buttonStyle('#3b82f6', consolidateDisabled)}
                        >
                          {others.length > 0 ? `Consolidate ${others.length} selected to this version` : 'Consolidate to this version'}
                        </button>
                        <button
                          disabled={removeDisabled}
                          title={removable === 0
                            ? (others.length > 0
                              ? 'The checked versions are on other albums, which can only be consolidated.'
                              : 'Check other versions from this track\'s album to remove.')
                            : 'Delete the checked versions from this track\'s album and keep this one.'}
                          onClick={() => handleRemoveOthers(group, track)}
                          style={buttonStyle('#dc2626', removeDisabled)}
                        >
                          {removable > 0 ? `Remove ${removable} selected` : 'Remove selected'}
                        </button>
                        <button disabled={busy} onClick={() => handleNotDuplicate(group, track)} style={buttonStyle('var(--color-text-muted)', busy)}>
                          Not a duplicate
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })
      )}

      <Pagination page={currentPage} totalPages={pagination?.totalPages} onPageChange={goToPage} />
    </div>
  );
}

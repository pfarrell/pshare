// src/components/admin/AlbumCompareModal.jsx
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import Modal from '../Modal';
import { apiService } from '../../services/api';
import { formatDuration } from '../../utils/formatters';

const formatDate = (dateString) => {
  if (!dateString) return 'N/A';
  return new Date(dateString).toLocaleString('en-US', {
    month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit',
  });
};

const cellStyle = { padding: '0.4rem 0.6rem', fontSize: '0.85rem', verticalAlign: 'top' };
const labelCellStyle = { ...cellStyle, color: 'var(--color-text-muted)', whiteSpace: 'nowrap' };
const diffCellStyle = { ...cellStyle, backgroundColor: 'rgba(251, 191, 36, 0.15)' };

// Metadata fields shown as label -> value rows. `format` defaults to String().
const META_FIELDS = [
  { label: 'ID', get: (a) => a.id },
  { label: 'Artist', get: (a) => a.artist_name ?? '(unknown)' },
  { label: 'Release year', get: (a) => a.release_year ?? '—' },
  { label: 'Disc number', get: (a) => a.disc_number ?? '—' },
  { label: 'Compilation', get: (a) => (a.is_compilation ? 'Yes' : 'No') },
  { label: 'Track count', get: (a) => a.track_count },
  { label: 'MusicBrainz ID', get: (a) => a.musicbrainz_id ?? '—' },
  { label: 'MBID confidence', get: (a) => a.mbid_confidence ?? '—' },
  { label: 'MBID status', get: (a) => a.mbid_status ?? '—' },
  { label: 'Created', get: (a) => formatDate(a.created_at) },
  { label: 'Updated', get: (a) => formatDate(a.updated_at) },
];

// Pairs up two albums' tracks by track_number (already sorted numerically by
// the backend) — union of both track_numbers, in order, blanks where one
// side has nothing at that slot.
//
// track_number isn't unique within an album (bonus/hidden tracks, disc
// mislabeling, bad tags can all produce two tracks sharing a number) — group
// into arrays per key rather than collapsing to one track per key, or a
// same-side duplicate silently overwrites and disappears instead of showing.
// When one side has more tracks under a number than the other, the extras
// get their own row with a blank opposite them.
function pairTracks(tracksA, tracksB) {
  const groupByKey = (tracks) => {
    const groups = new Map();
    for (const t of tracks) {
      const key = t.track_number ?? `__notrack_${t.id}`;
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(t);
    }
    return groups;
  };
  const groupsA = groupByKey(tracksA);
  const groupsB = groupByKey(tracksB);

  const seen = new Set();
  const order = [];
  for (const t of [...tracksA, ...tracksB]) {
    const key = t.track_number ?? `__notrack_${t.id}`;
    if (!seen.has(key)) { seen.add(key); order.push(key); }
  }

  const rows = [];
  for (const key of order) {
    const groupA = groupsA.get(key) ?? [];
    const groupB = groupsB.get(key) ?? [];
    const rowCount = Math.max(groupA.length, groupB.length, 1);
    for (let i = 0; i < rowCount; i++) {
      rows.push({ key: `${key}__${i}`, trackA: groupA[i], trackB: groupB[i] });
    }
  }
  return rows;
}

const trackLabel = (track) => {
  if (!track) return null;
  const duration = formatDuration(track.duration_sec);
  return `${track.title ?? '(untitled)'}${duration ? ` (${duration})` : ''}`;
};

export default function AlbumCompareModal({ idA, idB, onClose }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const response = await apiService.compareAlbums(idA, idB);
        if (!cancelled) setData(response.data);
      } catch (err) {
        console.error('Failed to load album comparison:', err);
        if (!cancelled) setError('Failed to load comparison');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [idA, idB]);

  return (
    <Modal onClose={onClose} size="lg" labelledBy="album-compare-title">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1rem' }}>
        <h2 id="album-compare-title" style={{ margin: 0, fontSize: '1.25rem', color: 'var(--color-text-primary)' }}>
          Compare Albums
        </h2>
        <button
          onClick={onClose}
          style={{ background: 'none', border: 'none', fontSize: '1.25rem', cursor: 'pointer', color: 'var(--color-text-muted)', lineHeight: 1 }}
          aria-label="Close"
        >
          ×
        </button>
      </div>

      {loading && <p style={{ color: 'var(--color-text-muted)' }}>Loading comparison...</p>}
      {error && <p style={{ color: '#dc2626' }}>{error}</p>}

      {data && (
        <div style={{ overflowY: 'auto', overflowX: 'auto' }}>
          <div style={{ display: 'flex', gap: '1rem', marginBottom: '0.75rem' }}>
            {[data.a, data.b].map((album) => (
              <Link
                key={album.id}
                to={`/album/${album.id}`}
                target="_blank"
                rel="noreferrer"
                style={{ flex: '1 1 0', minWidth: 0, fontWeight: 'bold', color: '#3b82f6', textDecoration: 'none' }}
              >
                {album.title} ↗
              </Link>
            ))}
          </div>

          <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: '1.25rem' }}>
            <tbody>
              {META_FIELDS.map((field) => {
                const valueA = field.get(data.a);
                const valueB = field.get(data.b);
                const differs = String(valueA) !== String(valueB);
                return (
                  <tr key={field.label} style={{ borderBottom: '1px solid var(--color-border)' }}>
                    <td style={labelCellStyle}>{field.label}</td>
                    <td style={differs ? diffCellStyle : cellStyle}>{valueA}</td>
                    <td style={differs ? diffCellStyle : cellStyle}>{valueB}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>

          <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: '400px' }}>
            <thead>
              <tr style={{ borderBottom: '2px solid var(--color-border)' }}>
                <th style={{ ...labelCellStyle, textAlign: 'left' }}>#</th>
                <th style={{ ...cellStyle, textAlign: 'left' }}>{data.a.title}</th>
                <th style={{ ...cellStyle, textAlign: 'left' }}>{data.b.title}</th>
              </tr>
            </thead>
            <tbody>
              {pairTracks(data.a.tracks, data.b.tracks).map(({ key, trackA, trackB }) => {
                const labelA = trackLabel(trackA);
                const labelB = trackLabel(trackB);
                const differs = labelA !== labelB;
                return (
                  <tr key={key} style={{ borderBottom: '1px solid var(--color-border)' }}>
                    <td style={labelCellStyle}>{trackA?.track_number ?? trackB?.track_number ?? '—'}</td>
                    <td style={differs ? diffCellStyle : cellStyle}>{labelA ?? '—'}</td>
                    <td style={differs ? diffCellStyle : cellStyle}>{labelB ?? '—'}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </Modal>
  );
}

// src/components/admin/AlbumCompareModal.jsx
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import Modal from '../Modal';
import { apiService } from '../../services/api';
import { formatDuration } from '../../utils/formatters';
import { normalizeTitle, titlesRoughlyMatch } from '../../utils/titleMatch';

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

// Pairs up two albums' tracks by title, not track_number — duplicate-album
// candidates routinely disagree on numbering (zero-padding: "1" vs "01";
// bonus tracks shifting everything after them; disc splits; remasters), but
// that's exactly what this view exists to surface, not something to sort by.
// Title identity ("is this the same song") is the meaningful join key here;
// track_number is still shown per row but never used to align rows.
//
// Greedy match: walk album A's tracks in the backend's sorted order, and for
// each one claim the first not-yet-claimed B track whose title roughly
// matches (exact normalized match preferred over substring, so "Song" binds
// to an exact "Song" before an unrelated "Song (Reprise)" does). Claiming
// marks the B track used so it can't also pair with a later A track. Any B
// tracks left unclaimed get trailing rows of their own — like the
// same-track-number fix this replaces, a track must never just disappear.
function pairTracks(tracksA, tracksB) {
  const pool = tracksB.map((t) => ({ t, used: false }));

  const claim = (title) => {
    const nt = normalizeTitle(title);
    if (!nt) return null;
    let candidate = pool.find((b) => !b.used && normalizeTitle(b.t.title) === nt);
    if (!candidate) candidate = pool.find((b) => !b.used && titlesRoughlyMatch(b.t.title, title));
    if (candidate) candidate.used = true;
    return candidate?.t ?? null;
  };

  const rows = tracksA.map((t) => ({ key: `a-${t.id}`, trackA: t, trackB: claim(t.title) }));
  for (const b of pool) {
    if (!b.used) rows.push({ key: `b-${b.t.id}`, trackA: undefined, trackB: b.t });
  }
  return rows;
}

const trackLabel = (track) => {
  if (!track) return null;
  const number = track.track_number ? `${track.track_number}. ` : '';
  const duration = formatDuration(track.duration_sec);
  return `${number}${track.title ?? '(untitled)'}${duration ? ` (${duration})` : ''}`;
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

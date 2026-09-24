// server/src/services/musicbrainzLocal.ts
//
// Local-mirror replacements for the MusicBrainz web-API point lookups and
// admin search in ./musicbrainz.ts. Queries a partial mirror of the official
// MusicBrainz schema (see server/src/db/musicbrainzDb.ts for which tables
// are loaded) instead of hitting the rate-limited musicbrainz.org web
// service, eliminating both the ~1.1s/request throttle and dependency on
// musicbrainz.org's uptime for these lookups.
//
// NOT covered here (still use ./musicbrainz.ts's web-API versions):
//   - getReleaseRecordings: a different query shape (full ordered
//     tracklist for one release, used at upload time) — out of scope
//     for the admin-search migration below.
//   - lookupArtistMBID / lookupAlbumMBID: the confidence-scored automatic
//     upload-time matching. These need their score thresholds recalibrated
//     against pg_trgm similarity (which is not directly comparable to
//     MusicBrainz's own Lucene-based score) and validated against known-good
//     matches before being trusted for unattended writes.
//
// Known limitation: pg_trgm similarity has no notion of popularity/
// canonicity. A plain-string query for a very famous, short artist name
// can rank obscure same-named acts above the canonical one (e.g. "beatles"
// ranks "D-Beatles" above "The Beatles") since MusicBrainz's own search
// blends in signals (release counts, etc.) that a raw trigram mirror
// doesn't have. Acceptable here because these functions feed an
// admin-reviewed candidate list, not automatic matching — the correct
// entity still appears, just not always first.
//
// searchRecordingsMB specifically: `recording` is ~40M rows (vs ~2-3M for
// `artist`/`release`), and GIN trgm's `%` operator can't do index-accelerated
// top-N ordering — it materializes every row clearing the similarity
// threshold before sorting. At the default 0.3 threshold and default
// work_mem, common titles produced 30-70s queries (170k+ candidate rows for
// "Yesterday", worse from lossy bitmap recheck under low work_mem). Each
// call runs inside a transaction with SET LOCAL work_mem/similarity_threshold
// tuned to keep typical multi-word titles well under a second, plus a
// statement_timeout — short/common single-word titles (e.g. "Love") can
// still exceed it even tuned, so a timeout or any other local-mirror error
// falls back to the rate-limited musicbrainz.ts web-API version rather than
// surfacing a multi-second hang to the admin UI.

import { sql } from 'kysely'
import { mbDb } from '../db/musicbrainzDb.js'
import { searchRecordingsMB as searchRecordingsMBWeb } from './musicbrainz.js'
import type { MBArtistCandidate, MBReleaseCandidate, MBRecordingCandidate } from './musicbrainz.js'

function formatPartialDate(
  year: number | null,
  month: number | null,
  day: number | null
): string | undefined {
  if (year == null) return undefined
  if (month == null) return String(year)
  if (day == null) return `${year}-${String(month).padStart(2, '0')}`
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
}

export async function getArtistByMbid(
  mbid: string
): Promise<{ id: string; name: string; disambiguation?: string } | null> {
  const row = await mbDb
    .selectFrom('artist')
    .select(['gid', 'name', 'comment'])
    .where('gid', '=', mbid)
    .executeTakeFirst()

  if (!row) return null
  return { id: row.gid, name: row.name, disambiguation: row.comment || undefined }
}

interface ReleaseDateRow {
  gid: string
  title: string
  artist_credit: string
  rg_gid: string | null
  this_year: number | null
  this_month: number | null
  this_day: number | null
  orig_year: number | null
  orig_month: number | null
  orig_day: number | null
}

export async function getReleaseByMbid(
  mbid: string
): Promise<{ id: string; title: string; artist_credit?: string; date?: string; original_date?: string; release_group_id?: string } | null> {
  const result = await sql<ReleaseDateRow>`
    WITH target AS (
      SELECT r.id AS release_id, r.gid, r.name AS title, r.release_group AS rg_id, ac.name AS artist_credit
      FROM release r
      JOIN artist_credit ac ON ac.id = r.artist_credit
      WHERE r.gid = ${mbid}
    ),
    release_group_gid AS (
      SELECT gid FROM release_group WHERE id = (SELECT rg_id FROM target)
    ),
    this_release_date AS (
      SELECT date_year, date_month, date_day FROM (
        SELECT date_year, date_month, date_day FROM release_country WHERE release = (SELECT release_id FROM target)
        UNION ALL
        SELECT date_year, date_month, date_day FROM release_unknown_country WHERE release = (SELECT release_id FROM target)
      ) x
      WHERE date_year IS NOT NULL
      ORDER BY date_year, COALESCE(date_month, 1), COALESCE(date_day, 1)
      LIMIT 1
    ),
    group_earliest_date AS (
      SELECT date_year, date_month, date_day FROM (
        SELECT rc.date_year, rc.date_month, rc.date_day
        FROM release r2 JOIN release_country rc ON rc.release = r2.id
        WHERE r2.release_group = (SELECT rg_id FROM target)
        UNION ALL
        SELECT ruc.date_year, ruc.date_month, ruc.date_day
        FROM release r2 JOIN release_unknown_country ruc ON ruc.release = r2.id
        WHERE r2.release_group = (SELECT rg_id FROM target)
      ) x
      WHERE date_year IS NOT NULL
      ORDER BY date_year, COALESCE(date_month, 1), COALESCE(date_day, 1)
      LIMIT 1
    )
    SELECT
      (SELECT gid FROM target) AS gid,
      (SELECT title FROM target) AS title,
      (SELECT artist_credit FROM target) AS artist_credit,
      (SELECT gid FROM release_group_gid) AS rg_gid,
      (SELECT date_year FROM this_release_date) AS this_year,
      (SELECT date_month FROM this_release_date) AS this_month,
      (SELECT date_day FROM this_release_date) AS this_day,
      (SELECT date_year FROM group_earliest_date) AS orig_year,
      (SELECT date_month FROM group_earliest_date) AS orig_month,
      (SELECT date_day FROM group_earliest_date) AS orig_day
    WHERE EXISTS (SELECT 1 FROM target)
  `.execute(mbDb)

  const row = result.rows[0]
  if (!row) return null

  return {
    id: row.gid,
    title: row.title,
    artist_credit: row.artist_credit || undefined,
    date: formatPartialDate(row.this_year, row.this_month, row.this_day),
    original_date: formatPartialDate(row.orig_year, row.orig_month, row.orig_day),
    release_group_id: row.rg_gid || undefined,
  }
}

interface TrackForRecordingRow {
  name: string
  position: number
  medium_position: number
  length: number | null
}

// Bemused's track-edit "Fill from MusicBrainz" action: given a recording and
// (usually) the release its local album is already matched to, returns that
// track's title/position within that specific release. Track position (and
// sometimes title) varies release-to-release — reissues, compilations, and
// deluxe editions renumber and sometimes retitle a recording — so an exact
// release match is preferred. When releaseMbid is omitted, or doesn't
// actually contain this recording, this falls back to any release
// containing it (lowest internal release id, same deterministic pick
// getReleaseByMbid-adjacent lookups use elsewhere) and flags the result as
// inexact via exactRelease — callers should not trust trackNumber then.
export async function getTrackForRecording(
  recordingMbid: string,
  releaseMbid?: string
): Promise<{ title: string; trackNumber: number | null } | null> {
  if (releaseMbid) {
    const exact = await sql<TrackForRecordingRow>`
      SELECT t.name, t.position, m.position AS medium_position, t.length
      FROM recording rec
      JOIN track t ON t.recording = rec.id
      JOIN medium m ON m.id = t.medium
      JOIN release rel ON rel.id = m.release
      WHERE rec.gid = ${recordingMbid} AND rel.gid = ${releaseMbid}
      LIMIT 1
    `.execute(mbDb)
    const row = exact.rows[0]
    if (row) return { title: row.name, trackNumber: row.position }
  }

  const fallback = await sql<TrackForRecordingRow>`
    SELECT t.name, t.position, m.position AS medium_position, t.length
    FROM recording rec
    JOIN track t ON t.recording = rec.id
    JOIN medium m ON m.id = t.medium
    JOIN release rel ON rel.id = m.release
    WHERE rec.gid = ${recordingMbid}
    ORDER BY rel.id
    LIMIT 1
  `.execute(mbDb)
  const row = fallback.rows[0]
  if (!row) return null
  return { title: row.name, trackNumber: null }
}

interface ArtistSearchRow {
  gid: string
  name: string
  comment: string
  begin_date_year: number | null
  end_date_year: number | null
}

export async function searchArtistsMB(query: string): Promise<MBArtistCandidate[]> {
  const result = await sql<ArtistSearchRow>`
    SELECT gid, name, comment, begin_date_year, end_date_year
    FROM artist
    WHERE name % ${query} OR sort_name % ${query}
    ORDER BY GREATEST(similarity(name, ${query}), similarity(sort_name, ${query})) DESC
    LIMIT 8
  `.execute(mbDb)

  return result.rows.map(r => ({
    id: r.gid,
    name: r.name,
    disambiguation: r.comment || undefined,
    life_span: [r.begin_date_year, r.end_date_year].filter(Boolean).join(' – ') || undefined,
  }))
}

interface ReleaseSearchRow {
  gid: string
  title: string
  artist_credit: string
  comment: string
  track_count: number | null
  date_year: number | null
  date_month: number | null
  date_day: number | null
}

export async function searchReleasesMB(query: string): Promise<MBReleaseCandidate[]> {
  const result = await sql<ReleaseSearchRow>`
    SELECT
      r.gid, r.name AS title, ac.name AS artist_credit, r.comment,
      (SELECT m.track_count FROM medium m WHERE m.release = r.id ORDER BY m.position LIMIT 1) AS track_count,
      (
        SELECT date_year FROM (
          SELECT date_year, date_month, date_day FROM release_country WHERE release = r.id
          UNION ALL
          SELECT date_year, date_month, date_day FROM release_unknown_country WHERE release = r.id
        ) d WHERE date_year IS NOT NULL
        ORDER BY date_year, COALESCE(date_month, 1), COALESCE(date_day, 1) LIMIT 1
      ) AS date_year,
      (
        SELECT date_month FROM (
          SELECT date_year, date_month, date_day FROM release_country WHERE release = r.id
          UNION ALL
          SELECT date_year, date_month, date_day FROM release_unknown_country WHERE release = r.id
        ) d WHERE date_year IS NOT NULL
        ORDER BY date_year, COALESCE(date_month, 1), COALESCE(date_day, 1) LIMIT 1
      ) AS date_month,
      (
        SELECT date_day FROM (
          SELECT date_year, date_month, date_day FROM release_country WHERE release = r.id
          UNION ALL
          SELECT date_year, date_month, date_day FROM release_unknown_country WHERE release = r.id
        ) d WHERE date_year IS NOT NULL
        ORDER BY date_year, COALESCE(date_month, 1), COALESCE(date_day, 1) LIMIT 1
      ) AS date_day
    FROM release r
    JOIN artist_credit ac ON ac.id = r.artist_credit
    WHERE r.name % ${query}
    ORDER BY similarity(r.name, ${query}) DESC
    LIMIT 8
  `.execute(mbDb)

  return result.rows.map(r => ({
    id: r.gid,
    title: r.title,
    artist_credit: r.artist_credit || undefined,
    date: formatPartialDate(r.date_year, r.date_month, r.date_day),
    track_count: r.track_count || undefined,
    disambiguation: r.comment || undefined,
  }))
}

interface RecordingSearchRow {
  gid: string
  title: string
  comment: string
  length: number | null
  artist_credit: string
  release_title: string | null
}

export async function searchRecordingsMB(query: string, artistName?: string): Promise<MBRecordingCandidate[]> {
  try {
    return await mbDb.transaction().execute(async (trx) => {
      await sql`SET LOCAL work_mem = '64MB'`.execute(trx)
      await sql`SET LOCAL pg_trgm.similarity_threshold = 0.6`.execute(trx)
      await sql`SET LOCAL statement_timeout = '4000'`.execute(trx)

      const artistFilter = artistName ? sql`AND ac.name % ${artistName}` : sql``

      const result = await sql<RecordingSearchRow>`
        SELECT
          rec.gid,
          rec.name AS title,
          rec.comment,
          rec.length,
          ac.name AS artist_credit,
          (
            SELECT rel.name
            FROM track t
            JOIN medium m ON m.id = t.medium
            JOIN release rel ON rel.id = m.release
            WHERE t.recording = rec.id
            ORDER BY t.id
            LIMIT 1
          ) AS release_title
        FROM recording rec
        JOIN artist_credit ac ON ac.id = rec.artist_credit
        WHERE rec.name % ${query}
        ${artistFilter}
        ORDER BY similarity(rec.name, ${query}) DESC
        LIMIT 8
      `.execute(trx)

      return result.rows.map(r => ({
        id: r.gid,
        title: r.title,
        artistCredit: r.artist_credit || undefined,
        releaseTitle: r.release_title || undefined,
        length: r.length || undefined,
        disambiguation: r.comment || undefined,
      }))
    })
  } catch (error) {
    console.warn('Local recording-mirror search failed (timeout or error), falling back to web API:', error)
    return searchRecordingsMBWeb(query, artistName)
  }
}

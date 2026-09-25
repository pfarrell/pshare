import { Kysely, sql } from 'kysely'
import type { Context } from 'hono'
import pg from 'pg'
import { db, Database, pool } from '../db/database.js'
import { streamBase } from '../db/streamUrl.js'
import { countsService } from './countsService.js'

const EXACT_MATCH_SCORE = 2.0
const FUZZY_SIMILARITY_THRESHOLD = 0.24
export const RESULT_LIMIT = 30

function buildSearchClauses(exactOnly: boolean, tagParamIndex: number | null): { exactClauses: string; fuzzyClauses: string } {
  // Album/Artist branches optionally join to their own tag rows (own-tags
  // only, no artist→album inheritance — see spec's Non-goals). Playlist and
  // Collection branches never get this join; they have no tag concept.
  const albumTagJoin = tagParamIndex
    ? `INNER JOIN albums_tags stag ON stag.album_id = a.id AND stag.tag_id = ANY($${tagParamIndex})`
    : ''
  const artistTagJoin = tagParamIndex
    ? `INNER JOIN artists_tags stag ON stag.artist_id = a.id AND stag.tag_id = ANY($${tagParamIndex})`
    : ''

  const exactClauses = `
    (SELECT DISTINCT ON (a.id) 'Album' AS model_type, a.id, ${EXACT_MATCH_SCORE} AS similarity_score
      FROM albums a
      INNER JOIN tracks t ON t.album_id = a.id AND t.approved = true
      ${albumTagJoin}
      WHERE f_unaccent(lower(a.title)) ILIKE f_unaccent(lower($1))
        AND a.title != '_Singles'
      ORDER BY a.id)
    UNION ALL
    (SELECT DISTINCT ON (a.id) 'Artist' AS model_type, a.id, ${EXACT_MATCH_SCORE} AS similarity_score
      FROM artists a
      INNER JOIN albums al ON al.artist_id = a.id
      INNER JOIN tracks t ON t.album_id = al.id AND t.approved = true
      ${artistTagJoin}
      WHERE f_unaccent(lower(a.name)) ILIKE f_unaccent(lower($1))
      ORDER BY a.id)
    UNION ALL
    (SELECT DISTINCT ON (a.id) 'Artist' AS model_type, a.id, ${EXACT_MATCH_SCORE} AS similarity_score
      FROM artists a
      INNER JOIN tracks t ON t.artist_id = a.id AND t.approved = true
      ${artistTagJoin}
      WHERE f_unaccent(lower(a.name)) ILIKE f_unaccent(lower($1))
      ORDER BY a.id)
    UNION ALL
    (SELECT DISTINCT ON (id) 'Playlist' AS model_type, id, ${EXACT_MATCH_SCORE} AS similarity_score
      FROM playlists
      WHERE f_unaccent(lower(name)) ILIKE f_unaccent(lower($1))
      ORDER BY id)
    UNION ALL
    (SELECT DISTINCT ON (id) 'Collection' AS model_type, id, ${EXACT_MATCH_SCORE} AS similarity_score
      FROM collections
      WHERE f_unaccent(lower(name)) ILIKE f_unaccent(lower($1))
      ORDER BY id)
  `

  const fuzzyClauses = exactOnly
    ? ''
    : `
    UNION ALL
    (SELECT model_type, id, similarity_score FROM (
      SELECT 'Album' AS model_type, a.id,
        similarity(f_unaccent(lower(a.title)), f_unaccent(lower($2))) AS similarity_score,
        ROW_NUMBER() OVER(PARTITION BY a.id ORDER BY similarity(f_unaccent(lower(a.title)), f_unaccent(lower($2))) DESC) AS rn
      FROM albums a
      INNER JOIN tracks t ON t.album_id = a.id AND t.approved = true
      ${albumTagJoin}
      WHERE f_unaccent(lower(a.title)) % f_unaccent(lower($2))
        AND a.title != '_Singles'
    ) ranked WHERE rn = 1)
    UNION ALL
    (SELECT model_type, id, similarity_score FROM (
      SELECT 'Artist' AS model_type, a.id,
        similarity(f_unaccent(lower(a.name)), f_unaccent(lower($2))) AS similarity_score,
        ROW_NUMBER() OVER(PARTITION BY a.id ORDER BY similarity(f_unaccent(lower(a.name)), f_unaccent(lower($2))) DESC) AS rn
      FROM artists a
      INNER JOIN albums al ON al.artist_id = a.id
      INNER JOIN tracks t ON t.album_id = al.id AND t.approved = true
      ${artistTagJoin}
      WHERE f_unaccent(lower(a.name)) % f_unaccent(lower($2))
    ) ranked WHERE rn = 1)
    UNION ALL
    (SELECT model_type, id, similarity_score FROM (
      SELECT 'Artist' AS model_type, a.id,
        similarity(f_unaccent(lower(a.name)), f_unaccent(lower($2))) AS similarity_score,
        ROW_NUMBER() OVER(PARTITION BY a.id ORDER BY similarity(f_unaccent(lower(a.name)), f_unaccent(lower($2))) DESC) AS rn
      FROM artists a
      INNER JOIN tracks t ON t.artist_id = a.id AND t.approved = true
      ${artistTagJoin}
      WHERE f_unaccent(lower(a.name)) % f_unaccent(lower($2))
    ) ranked WHERE rn = 1)
    UNION ALL
    (SELECT model_type, id, similarity_score FROM (
      SELECT 'Playlist' AS model_type, id,
        similarity(f_unaccent(lower(name)), f_unaccent(lower($2))) AS similarity_score,
        ROW_NUMBER() OVER(PARTITION BY id ORDER BY similarity(f_unaccent(lower(name)), f_unaccent(lower($2))) DESC) AS rn
      FROM playlists
      WHERE f_unaccent(lower(name)) % f_unaccent(lower($2))
    ) ranked WHERE rn = 1)
    UNION ALL
    (SELECT model_type, id, similarity_score FROM (
      SELECT 'Collection' AS model_type, id,
        similarity(f_unaccent(lower(name)), f_unaccent(lower($2))) AS similarity_score,
        ROW_NUMBER() OVER(PARTITION BY id ORDER BY similarity(f_unaccent(lower(name)), f_unaccent(lower($2))) DESC) AS rn
      FROM collections
      WHERE f_unaccent(lower(name)) % f_unaccent(lower($2))
    ) ranked WHERE rn = 1)
  `

  return { exactClauses, fuzzyClauses }
}

// A dedicated client (not pool.query) is required here: the fuzzy branch needs
// `pg_trgm.similarity_threshold` set on the SAME connection as the parameterized
// SELECT that follows, so the GIN index (built for that threshold's `%` operator)
// is actually used. `SET` isn't parameterizable, but the threshold is a fixed
// internal constant, never user input, so inlining it is safe.
// Uses the shared pool: SET LOCAL is scoped to this BEGIN/COMMIT, so the
// threshold never leaks onto a connection Kysely later reuses.
async function runSearchQuery<T extends pg.QueryResultRow>(
  sqlText: string,
  params: unknown[],
  exactOnly: boolean
): Promise<T[]> {
  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    if (!exactOnly) {
      await client.query(`SET LOCAL pg_trgm.similarity_threshold = ${FUZZY_SIMILARITY_THRESHOLD}`)
    }
    const { rows } = await client.query<T>(sqlText, params)
    await client.query('COMMIT')
    return rows
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {})
    throw err
  } finally {
    client.release()
  }
}

export function createSearchService(db: Kysely<Database>) {
  return {
    async runUnionSearch(
      likeParam: string,
      filteredQ: string,
      exactOnly: boolean,
      limit: number,
      offset: number,
      tagIds: number[] | null = null
    ) {
      if (!Number.isInteger(limit) || limit < 0 || !Number.isInteger(offset) || offset < 0) {
        throw new Error('runUnionSearch: limit and offset must be non-negative integers')
      }
      if (tagIds && tagIds.length === 0) return []

      const tagParamIndex = tagIds ? (exactOnly ? 2 : 3) : null
      const { exactClauses, fuzzyClauses } = buildSearchClauses(exactOnly, tagParamIndex)

      // Secondary sort keys (model_type, id) make ordering deterministic across
      // separate paginated queries — many rows tie at the exact-match score of
      // 2.0, and without a tiebreaker Postgres doesn't guarantee the same
      // relative order for tied rows on a later OFFSET query, which would let
      // page 2 re-show or skip rows from page 1.
      const searchSql = `
        SELECT q.model_type, q.id, q.similarity_score FROM (
          ${exactClauses}
          ${fuzzyClauses}
        ) q ORDER BY q.similarity_score DESC, q.model_type, q.id LIMIT ${limit} OFFSET ${offset}
      `

      const baseParams = exactOnly ? [likeParam] : [likeParam, filteredQ]
      const params = tagIds ? [...baseParams, tagIds] : baseParams
      return runSearchQuery<{ model_type: string; id: number; similarity_score: number }>(
        searchSql,
        params,
        exactOnly
      )
    },

    // Counts unique entities per type, not raw rows — the union's exact and
    // fuzzy branches can both match the same entity (UNION ALL, not UNION),
    // so a plain GROUP BY over the raw rows would overcount anything that
    // matched both branches.
    async countRankedResults(likeParam: string, filteredQ: string, exactOnly: boolean, tagIds: number[] | null = null) {
      if (tagIds && tagIds.length === 0) {
        return { Album: 0, Artist: 0, Playlist: 0, Collection: 0 }
      }

      const tagParamIndex = tagIds ? (exactOnly ? 2 : 3) : null
      const { exactClauses, fuzzyClauses } = buildSearchClauses(exactOnly, tagParamIndex)

      const countSql = `
        SELECT model_type, COUNT(*) AS count FROM (
          SELECT DISTINCT model_type, id FROM (
            ${exactClauses}
            ${fuzzyClauses}
          ) u
        ) deduped
        GROUP BY model_type
      `

      const baseParams = exactOnly ? [likeParam] : [likeParam, filteredQ]
      const params = tagIds ? [...baseParams, tagIds] : baseParams
      const rows = await runSearchQuery<{ model_type: string; count: string }>(countSql, params, exactOnly)

      const counts = { Album: 0, Artist: 0, Playlist: 0, Collection: 0 }
      for (const row of rows) {
        if (row.model_type in counts) {
          counts[row.model_type as keyof typeof counts] = parseInt(row.count, 10)
        }
      }
      return counts
    },

    async findTrackIds(likeParam: string, tagIds: number[] | null = null): Promise<number[]> {
      if (tagIds && tagIds.length === 0) return []

      const tagJoin = tagIds ? 'INNER JOIN tags_tracks tt ON tt.track_id = tracks.id AND tt.tag_id = ANY($2)' : ''
      const params: unknown[] = tagIds ? [likeParam, tagIds] : [likeParam]

      const { rows } = await pool.query<{ id: number }>(
        `SELECT DISTINCT tracks.id FROM tracks ${tagJoin}
         WHERE f_unaccent(lower(tracks.title)) ILIKE f_unaccent(lower($1)) AND tracks.approved = true`,
        params
      )
      return rows.map((r) => r.id)
    },

    async fetchPlaylistsWithCounts(ids: number[]) {
      if (!ids?.length) return []

      const rows = await db.selectFrom('playlists').selectAll().where('id', 'in', ids).execute()
      const trackCounts = await countsService.trackCountsByPlaylistIds(ids)
      const byId = new Map(rows.map((r: any) => [r.id, { ...r, track_count: trackCounts.get(r.id) ?? 0 }]))
      return ids.map((id) => byId.get(id)).filter(Boolean)
    },

    async fetchCollectionsByIds(ids: number[]) {
      if (!ids?.length) return []

      const rows = await db
        .selectFrom('collections')
        .select(['id', 'name', 'image_path', 'updated_at'])
        .where('id', 'in', ids)
        .execute()
      const albumCounts = await countsService.albumCountsByCollectionIds(ids)
      const byId = new Map(rows.map((r: any) => [r.id, { ...r, album_count: albumCounts.get(r.id) ?? 0 }]))
      return ids.map((id) => byId.get(id)).filter(Boolean)
    },

    async fetchArtistsWithCounts(ids: number[]) {
      if (!ids?.length) return []

      const rows = await db
        .selectFrom('artists')
        .leftJoin('albums', 'albums.artist_id', 'artists.id')
        .leftJoin('tracks', 'tracks.artist_id', 'artists.id')
        .select((eb) => [
          'artists.id',
          'artists.name',
          'artists.image_path',
          'artists.wikipedia',
          'artists.created_at',
          'artists.updated_at',
          eb.fn.count<number>('albums.id').distinct().as('album_count'),
          eb.fn.count<number>('tracks.id').distinct().as('track_count'),
        ])
        .where('artists.id', 'in', ids)
        .where((eb) => eb.or([eb('tracks.approved', '=', true), eb('tracks.id', 'is', null)]))
        .groupBy(['artists.id', 'artists.name', 'artists.image_path', 'artists.wikipedia', 'artists.created_at', 'artists.updated_at'])
        .execute()

      const byId = new Map(rows.map((r: any) => [r.id, r]))
      return ids.map((id) => byId.get(id)).filter(Boolean)
    },

    async fetchAlbumsByIds(ids: number[]) {
      if (!ids?.length) return []
      const rows = await db
        .selectFrom('albums')
        .innerJoin('artists', 'artists.id', 'albums.artist_id')
        .leftJoin('tracks', 'tracks.album_id', 'albums.id')
        .select((eb) => [
          'albums.id', 'albums.title', 'albums.image_path', 'albums.release_year', 'albums.wikipedia',
          'artists.id as artist_id', 'artists.name as artist_name',
          eb.fn.count<number>('tracks.id').distinct().as('track_count'),
          sql<boolean>`EXISTS (
            SELECT 1 FROM artist_albums caa WHERE caa.album_id = albums.id AND caa.role = 'collaborator'
          )`.as('has_collaborators'),
        ])
        .where('albums.id', 'in', ids)
        .where((eb) => eb.or([eb('tracks.approved', '=', true), eb('tracks.id', 'is', null)]))
        .groupBy(['albums.id', 'albums.title', 'albums.image_path', 'albums.release_year', 'albums.wikipedia', 'artists.id', 'artists.name'])
        .execute()
      const byId = new Map(rows.map((r) => [r.id, { ...r, artist: { id: r.artist_id, name: r.artist_name } }]))
      return ids.map((id) => byId.get(id)).filter(Boolean)
    },

    async fetchTracksByIds(ids: number[], c: Context) {
      if (!ids?.length) return []
      const rows = await db
        .selectFrom('tracks')
        .leftJoin('albums', 'albums.id', 'tracks.album_id')
        .leftJoin('artists as album_artist', 'album_artist.id', 'albums.artist_id')
        .leftJoin('artists as track_artist', 'track_artist.id', 'tracks.artist_id')
        .select([
          'tracks.id',
          'tracks.title',
          'tracks.track_number',
          'tracks.duration_sec',
          'albums.id as album_id',
          'albums.title as album_title',
          'albums.image_path as album_image_path',
          'albums.release_year as album_release_year',
          'album_artist.id as album_artist_id',
          'album_artist.name as album_artist_name',
          'track_artist.id as track_artist_id',
          'track_artist.name as track_artist_name',
        ])
        .where('tracks.id', 'in', ids)
        .where('tracks.approved', '=', true)
        .execute()

      return rows.map((t) => ({
        id: t.id,
        title: t.title,
        track_number: t.track_number,
        duration: t.duration_sec,
        album: t.album_id ? { id: t.album_id, title: t.album_title, release_year: t.album_release_year, artist: { id: t.album_artist_id, name: t.album_artist_name } } : null,
        artist: { id: t.track_artist_id ?? t.album_artist_id, name: t.track_artist_name ?? t.album_artist_name },
        image_path: t.album_image_path,
        url: `${streamBase(c)}/stream/${t.id}`,
        download_url: `${streamBase(c)}/download/${t.id}`,
      }))
    },
  }
}

export const searchService = createSearchService(db)

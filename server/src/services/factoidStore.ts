// server/src/services/factoidStore.ts
// Persistence and read queries for cached factoids. The read path never
// generates: that separation is what lets the kiosk sit idle at zero cost.
import { sql } from 'kysely'
import { db } from '../db/database.js'
import type { AcceptedFactoid } from './factoidValidation.js'

export interface FactoidRow {
  id: number
  kind: 'artist' | 'album' | 'track'
  target_id: number
  text: string
  source_url: string
  source_title: string | null
  created_at: Date
}

// `subject` is the display name of whatever the factoid is about, resolved
// server-side so the kiosk can render "About Steely Dan" without a second
// request.
export interface FactoidForDisplay extends FactoidRow {
  subject: string
}

const DEFAULT_TRACK_LIMIT = 12
const DEFAULT_RANDOM_LIMIT = 12

export async function insertFactoids(
  accepted: AcceptedFactoid[],
  model: string,
  generationId: number,
): Promise<number> {
  if (accepted.length === 0) return 0
  await db
    .insertInto('factoids')
    .values(accepted.map((f) => ({
      kind: f.kind,
      target_id: f.targetId,
      text: f.text,
      source_url: f.sourceUrl,
      source_title: f.sourceTitle,
      model,
      generation_id: generationId,
    })))
    .execute()
  return accepted.length
}

export async function existingTexts(
  kind: 'artist' | 'album' | 'track',
  targetId: number,
): Promise<string[]> {
  const rows = await db
    .selectFrom('factoids')
    .select('text')
    .where('kind', '=', kind)
    .where('target_id', '=', targetId)
    .execute()
  return rows.map((r) => r.text)
}

// One query for all three scopes. The album and artist joins are LEFT joins
// because tracks.album_id and tracks.artist_id have no foreign keys and may be
// null or dangling: a compilation track or an orphaned row must still return
// whatever factoids do exist rather than erroring.
export async function listForTrack(trackId: number, limit = DEFAULT_TRACK_LIMIT): Promise<FactoidForDisplay[]> {
  const result = await sql<FactoidForDisplay>`
    WITH target AS (
      SELECT t.id AS track_id, t.title AS track_title,
             al.id AS album_id, al.title AS album_title,
             ar.id AS artist_id, ar.name AS artist_name
        FROM tracks t
        LEFT JOIN albums al ON al.id = t.album_id
        LEFT JOIN artists ar ON ar.id = COALESCE(t.artist_id, al.artist_id)
       WHERE t.id = ${trackId}
    )
    SELECT f.id, f.kind, f.target_id, f.text, f.source_url, f.source_title, f.created_at,
           CASE f.kind
             WHEN 'track' THEN target.track_title
             WHEN 'album' THEN target.album_title
             ELSE target.artist_name
           END AS subject
      FROM factoids f
      JOIN target ON (
        (f.kind = 'track'  AND f.target_id = target.track_id) OR
        (f.kind = 'album'  AND f.target_id = target.album_id) OR
        (f.kind = 'artist' AND f.target_id = target.artist_id)
      )
     WHERE COALESCE(
       CASE f.kind
         WHEN 'track' THEN target.track_title
         WHEN 'album' THEN target.album_title
         ELSE target.artist_name
       END, '') <> ''
     ORDER BY f.created_at DESC
     LIMIT ${limit}
  `.execute(db)
  return result.rows
}

export async function listForTarget(
  kind: 'artist' | 'album' | 'track',
  targetId: number,
): Promise<FactoidRow[]> {
  return db
    .selectFrom('factoids')
    .select(['id', 'kind', 'target_id', 'text', 'source_url', 'source_title', 'created_at'])
    .where('kind', '=', kind)
    .where('target_id', '=', targetId)
    .orderBy('created_at', 'desc')
    .execute() as Promise<FactoidRow[]>
}

// Used when the screensaver is running with nothing playing. The joins drop
// factoids whose subject no longer exists, which is the read-path safety net
// behind the explicit cleanup wiring in Task 8.
export async function randomFactoids(limit = DEFAULT_RANDOM_LIMIT): Promise<FactoidForDisplay[]> {
  const result = await sql<FactoidForDisplay>`
    SELECT f.id, f.kind, f.target_id, f.text, f.source_url, f.source_title, f.created_at,
           COALESCE(ar.name, al.title, t.title) AS subject
      FROM factoids f
      LEFT JOIN artists ar ON f.kind = 'artist' AND ar.id = f.target_id
      LEFT JOIN albums  al ON f.kind = 'album'  AND al.id = f.target_id
      LEFT JOIN tracks  t  ON f.kind = 'track'  AND t.id  = f.target_id
     WHERE COALESCE(ar.name, al.title, t.title) IS NOT NULL
     ORDER BY random()
     LIMIT ${limit}
  `.execute(db)
  return result.rows
}

export interface AdminFactoidRow extends FactoidRow {
  model: string
  // Name of whatever the factoid is about; null when that row no longer exists.
  subject: string | null
  // Artist name for an album or track factoid, for context.
  by: string | null
  // The admin page for the subject (a track links to its album); null when
  // there is nothing to link to.
  link: { kind: 'artist' | 'album', id: number } | null
}

export interface AdminFactoidFilter {
  kind?: 'artist' | 'album' | 'track'
  q?: string
}

// ILIKE treats \, % and _ as pattern syntax; an admin searching "100%" or
// "snake_case" means those characters literally.
const escapeLike = (s: string) => s.replace(/[\\%_]/g, '\\$&')

const adminWhere = ({ kind, q }: AdminFactoidFilter) => {
  const conds = [sql`TRUE`]
  if (kind) conds.push(sql`f.kind = ${kind}`)
  if (q) conds.push(sql`f.text ILIKE ${`%${escapeLike(q)}%`}`)
  return sql.join(conds, sql` AND `)
}

export async function countAllForAdmin(filter: AdminFactoidFilter): Promise<number> {
  const result = await sql<{ n: string }>`SELECT COUNT(*) AS n FROM factoids f WHERE ${adminWhere(filter)}`.execute(db)
  return Number(result.rows[0]?.n ?? 0)
}

// The global review list. Every join is a LEFT join and nothing is filtered on
// the subject existing: a factoid whose artist/album/track was deleted (the
// tables have no foreign keys) is exactly what an admin needs to find and prune.
export async function listAllForAdmin(
  filter: AdminFactoidFilter,
  limit: number,
  offset: number,
): Promise<AdminFactoidRow[]> {
  const result = await sql<AdminFactoidRow>`
    SELECT f.id, f.kind, f.target_id, f.text, f.source_url, f.source_title, f.model, f.created_at,
           CASE f.kind WHEN 'artist' THEN ar.name WHEN 'album' THEN al.title ELSE t.title END AS subject,
           byline.name AS by,
           CASE
             WHEN f.kind = 'artist' AND ar.id IS NOT NULL THEN json_build_object('kind', 'artist', 'id', ar.id)
             WHEN f.kind = 'album'  AND al.id IS NOT NULL THEN json_build_object('kind', 'album',  'id', al.id)
             WHEN f.kind = 'track'  AND tal.id IS NOT NULL THEN json_build_object('kind', 'album', 'id', tal.id)
           END AS link
      FROM factoids f
      LEFT JOIN artists ar  ON f.kind = 'artist' AND ar.id = f.target_id
      LEFT JOIN albums  al  ON f.kind = 'album'  AND al.id = f.target_id
      LEFT JOIN tracks  t   ON f.kind = 'track'  AND t.id  = f.target_id
      LEFT JOIN albums  tal ON f.kind = 'track'  AND tal.id = t.album_id
      LEFT JOIN artists byline ON byline.id = CASE f.kind
                                                WHEN 'album' THEN al.artist_id
                                                WHEN 'track' THEN COALESCE(t.artist_id, tal.artist_id)
                                              END
     WHERE ${adminWhere(filter)}
     ORDER BY f.created_at DESC, f.id DESC
     LIMIT ${limit} OFFSET ${offset}
  `.execute(db)
  return result.rows
}

export async function deleteFactoid(id: number): Promise<boolean> {
  const deleted = await db.deleteFrom('factoids').where('id', '=', id).returning('id').executeTakeFirst()
  return deleted !== undefined
}

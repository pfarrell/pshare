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

export async function deleteFactoid(id: number): Promise<boolean> {
  const deleted = await db.deleteFrom('factoids').where('id', '=', id).returning('id').executeTakeFirst()
  return deleted !== undefined
}

// server/src/services/factoidLedger.ts
// The generation ledger: one row per researched entity, doing triple duty as
// the atomic claim, the retry policy, and the spend audit trail. See
// docs/superpowers/specs/2026-09-30-factoid-screensaver-design.md
import { sql } from 'kysely'
import { db } from '../db/database.js'

export type FactoidTargetKind = 'artist' | 'album'

// A worker killed mid-call would otherwise leave an entity claimed forever.
export const STALE_PENDING_MS = 15 * 60 * 1000
// One generation per poll tick, capped per rolling day: an unattended kiosk
// playing all night cannot run up a surprise bill.
export const MAX_GENERATIONS_PER_DAY = 50
export const FAILED_RETRY_AFTER_MS = 24 * 60 * 60 * 1000
export const MAX_ATTEMPTS = 3
// Only entities played recently are worth researching; cost follows listening.
const CANDIDATE_LOOKBACK_DAYS = 7

// Returns the ledger row id on a successful claim, or null when the entity is
// already claimed, already researched, or has exhausted its retries.
//
// The INSERT ... ON CONFLICT DO NOTHING is the whole concurrency story: two
// ticks racing on the same entity cannot both get a row back, so neither can
// double-bill. The UPDATE branch handles the retry case, and is guarded by the
// same uniqueness, so it is equally safe.
export async function claimEntity(kind: FactoidTargetKind, targetId: number): Promise<number | null> {
  const inserted = await db
    .insertInto('factoid_generations')
    .values({ kind, target_id: targetId, status: 'pending' })
    .onConflict((oc) => oc.columns(['kind', 'target_id']).doNothing())
    .returning('id')
    .executeTakeFirst()
  if (inserted) return inserted.id

  // Existing row: re-claim only a failed one that is aged and under the cap.
  const retried = await db
    .updateTable('factoid_generations')
    .set({ status: 'pending', attempts: sql`attempts + 1`, updated_at: new Date() })
    .where('kind', '=', kind)
    .where('target_id', '=', targetId)
    .where('status', '=', 'failed')
    .where('attempts', '<', MAX_ATTEMPTS)
    .where('updated_at', '<', new Date(Date.now() - FAILED_RETRY_AFTER_MS))
    .returning('id')
    .executeTakeFirst()
  return retried?.id ?? null
}

export async function recordResult(
  generationId: number,
  status: 'ok' | 'empty' | 'failed',
  factoidCount: number,
  error: string | null = null,
): Promise<void> {
  await db
    .updateTable('factoid_generations')
    .set({ status, factoid_count: factoidCount, error, updated_at: new Date() })
    .where('id', '=', generationId)
    .execute()
}

export async function reapStalePending(): Promise<number> {
  const reaped = await db
    .updateTable('factoid_generations')
    .set({ status: 'failed', error: 'reaped: pending past the stale threshold', updated_at: new Date() })
    .where('status', '=', 'pending')
    .where('updated_at', '<', new Date(Date.now() - STALE_PENDING_MS))
    .returning('id')
    .execute()
  return reaped.length
}

export async function generationsInLastDay(): Promise<number> {
  const { count } = await db
    .selectFrom('factoid_generations')
    .select(db.fn.count('id').as('count'))
    .where('created_at', '>', new Date(Date.now() - 24 * 60 * 60 * 1000))
    .executeTakeFirstOrThrow()
  return Number(count)
}

// Playback IS the queue: `logs` already records album_id and artist_id on
// every play, so there is no enqueue path to build and no way for a job table
// to drift from what was actually listened to. Both columns are nullable, so
// nulls are filtered explicitly.
export async function nextCandidate(): Promise<{ kind: FactoidTargetKind, targetId: number } | null> {
  const since = new Date(Date.now() - CANDIDATE_LOOKBACK_DAYS * 24 * 60 * 60 * 1000)

  const row = await sql<{ kind: FactoidTargetKind, target_id: number }>`
    SELECT kind, target_id FROM (
      SELECT 'album'::text AS kind, l.album_id AS target_id, MAX(l.created_at) AS last_played
        FROM logs l
        JOIN albums a ON a.id = l.album_id
       WHERE l.album_id IS NOT NULL AND l.created_at > ${since}
       GROUP BY l.album_id
      UNION ALL
      SELECT 'artist'::text AS kind, l.artist_id AS target_id, MAX(l.created_at) AS last_played
        FROM logs l
        JOIN artists ar ON ar.id = l.artist_id
       WHERE l.artist_id IS NOT NULL AND l.created_at > ${since}
       GROUP BY l.artist_id
    ) played
    WHERE NOT EXISTS (
      SELECT 1 FROM factoid_generations g
       WHERE g.kind = played.kind AND g.target_id = played.target_id
    )
    ORDER BY played.last_played DESC
    LIMIT 1
  `.execute(db)

  const first = row.rows[0]
  return first ? { kind: first.kind, targetId: first.target_id } : null
}

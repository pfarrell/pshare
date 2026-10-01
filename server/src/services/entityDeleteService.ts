// server/src/services/entityDeleteService.ts
import { sql, type Kysely } from 'kysely'
import type { Database } from '../db/database.js'

// factoids.target_id and factoid_generations.target_id are polymorphic
// (kind + target_id, like notes and favorites), so PostgreSQL cannot enforce a
// foreign key. Every delete and merge path has to clean up explicitly: the
// database will not catch a missed case. See CLAUDE.md on the missing FKs.
export async function deleteFactoidsFor(
  kind: 'artist' | 'album' | 'track',
  ids: number[],
  trx: Kysely<Database>,
): Promise<void> {
  if (ids.length === 0) return
  await trx.deleteFrom('factoids').where('kind', '=', kind).where('target_id', 'in', ids).execute()
  if (kind !== 'track') {
    await trx.deleteFrom('factoid_generations').where('kind', '=', kind).where('target_id', 'in', ids).execute()
  }
}

export async function reassignFactoids(
  kind: 'artist' | 'album' | 'track',
  fromId: number,
  toId: number,
  trx: Kysely<Database>,
): Promise<void> {
  // A merge exists because two records were duplicates, so both were likely
  // researched and independently found the same fact. Drop the loser's copies
  // of anything the target already says (exact match, ignoring case and edge
  // whitespace) before redirecting, so the kiosk does not show it twice.
  await trx
    .deleteFrom('factoids')
    .where('kind', '=', kind)
    .where('target_id', '=', fromId)
    .where(sql<boolean>`lower(btrim(text)) IN (
      SELECT lower(btrim(text)) FROM factoids WHERE kind = ${kind} AND target_id = ${toId}
    )`)
    .execute()
  await trx.updateTable('factoids')
    .set({ target_id: toId })
    .where('kind', '=', kind).where('target_id', '=', fromId)
    .execute()

  if (kind === 'track') return
  // The ledger's unique index on (kind, target_id) means a blind update would
  // abort the entire merge transaction when both sides have been researched.
  // The target's own row is the one worth keeping.
  const targetHasRow = await trx.selectFrom('factoid_generations').select('id')
    .where('kind', '=', kind).where('target_id', '=', toId).executeTakeFirst()
  if (targetHasRow) {
    await trx.deleteFrom('factoid_generations').where('kind', '=', kind).where('target_id', '=', fromId).execute()
  } else {
    await trx.updateTable('factoid_generations')
      .set({ target_id: toId })
      .where('kind', '=', kind).where('target_id', '=', fromId)
      .execute()
  }
}

// A media_files row can be shared by tracks outside the albums being deleted
// (the same recording on another release) — only delete rows no longer
// referenced by any remaining track. Call AFTER deleting the doomed tracks.
// The media_files FK's ON DELETE RESTRICT is the hard backstop underneath.
export async function deletableMediaFileIds(candidateIds: number[], trx: Kysely<Database>): Promise<number[]> {
  if (candidateIds.length === 0) return []
  const stillReferenced = await trx
    .selectFrom('tracks')
    .select('media_file_id')
    .where('media_file_id', 'in', candidateIds)
    .execute()
  const stillReferencedIds = new Set(stillReferenced.map((t) => t.media_file_id))
  return candidateIds.filter((id) => !stillReferencedIds.has(id))
}

export async function deleteAlbumsCascade(albumIds: number[], trx: Kysely<Database>): Promise<void> {
  if (albumIds.length === 0) return

  const tracks = await trx.selectFrom('tracks').select(['id', 'media_file_id']).where('album_id', 'in', albumIds).execute()
  const mediaFileIds = tracks.map((t) => t.media_file_id).filter((id): id is number => id != null)

  // Before the rows disappear: no FK means nothing else will do this.
  await deleteFactoidsFor('track', tracks.map((t) => t.id), trx)
  await deleteFactoidsFor('album', albumIds, trx)

  if (tracks.length > 0) {
    await trx.deleteFrom('tracks').where('album_id', 'in', albumIds).execute()
  }
  const deletable = await deletableMediaFileIds(mediaFileIds, trx)
  if (deletable.length > 0) {
    await trx.deleteFrom('media_files').where('id', 'in', deletable).execute()
  }
  await trx.deleteFrom('albums').where('id', 'in', albumIds).execute()
}

import { sql, type Kysely } from 'kysely'
import type { Database } from '../db/database.js'

// Folds `loserId` into `targetId` and deletes the loser. Run inside
// db.transaction(). Mirrors artistMergeService.ts's mergeArtistInto:
// dedupe against every unique constraint before redirecting, transfer
// everything that would otherwise be cascade-deleted or silently orphaned
// (see docs/superpowers/specs/2026-09-20-duplicate-detection-design.md
// §"What already exists" for the constraint-by-constraint inventory this
// follows), delete the loser last.
export async function mergeAlbumInto(
  targetId: number,
  loserId: number,
  trx: Kysely<Database>,
  trackOffset = 0
): Promise<{ tracksMoved: number }> {
  if (trackOffset > 0) {
    await trx
      .updateTable('tracks')
      .set({ track_number: sql`track_number::integer + ${trackOffset}`, updated_at: new Date() })
      .where('album_id', '=', loserId)
      .execute()
  }

  const destAlbum = await trx
    .selectFrom('albums')
    .select(['artist_id', 'is_compilation'])
    .where('id', '=', targetId)
    .executeTakeFirstOrThrow()

  const trackUpdateSet: Record<string, unknown> = { album_id: targetId, updated_at: new Date() }
  if (!destAlbum.is_compilation) trackUpdateSet.artist_id = destAlbum.artist_id

  const result = await trx.updateTable('tracks').set(trackUpdateSet).where('album_id', '=', loserId).execute()
  const tracksMoved = Number(result[0]?.numUpdatedRows ?? 0)

  // images: transfer, then ensure at most one primary survives
  const destPrimary = await trx
    .selectFrom('images')
    .select('id')
    .where('album_id', '=', targetId)
    .where('is_primary', '=', true)
    .executeTakeFirst()
  await trx.updateTable('images').set({ album_id: targetId }).where('album_id', '=', loserId).execute()
  if (destPrimary) {
    await trx
      .updateTable('images')
      .set({ is_primary: false })
      .where('album_id', '=', targetId)
      .where('id', '!=', destPrimary.id)
      .execute()
  }

  // favorites (kind='album'): dedup against UNIQUE(user_id, kind, target_id), then redirect
  await trx
    .deleteFrom('favorites')
    .where((eb) => eb.and([
      eb('kind', '=', 'album'),
      eb('target_id', '=', loserId),
      eb('user_id', 'in', trx.selectFrom('favorites').select('user_id').where('kind', '=', 'album').where('target_id', '=', targetId)),
    ]))
    .execute()
  await trx.updateTable('favorites').set({ target_id: targetId }).where('kind', '=', 'album').where('target_id', '=', loserId).execute()

  // notes (kind='album'): plain redirect, multiple notes per entity is normal
  await trx.updateTable('notes').set({ target_id: targetId }).where('kind', '=', 'album').where('target_id', '=', loserId).execute()

  // albums_tags: dedup, then redirect
  await trx
    .deleteFrom('albums_tags')
    .where((eb) => eb.and([
      eb('album_id', '=', loserId),
      eb('tag_id', 'in', trx.selectFrom('albums_tags').select('tag_id').where('album_id', '=', targetId)),
    ]))
    .execute()
  await trx.updateTable('albums_tags').set({ album_id: targetId }).where('album_id', '=', loserId).execute()

  // collection_albums: dedup against UNIQUE(collection_id, album_id), then redirect
  await trx
    .deleteFrom('collection_albums')
    .where((eb) => eb.and([
      eb('album_id', '=', loserId),
      eb('collection_id', 'in', trx.selectFrom('collection_albums').select('collection_id').where('album_id', '=', targetId)),
    ]))
    .execute()
  await trx.updateTable('collection_albums').set({ album_id: targetId }).where('album_id', '=', loserId).execute()

  await trx.deleteFrom('albums').where('id', '=', loserId).execute()

  return { tracksMoved }
}

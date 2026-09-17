import type { Kysely } from 'kysely'
import type { Database } from '../db/database.js'

// Folds `loserId` into `targetId` and deletes the loser. Run inside
// db.transaction(): albums.artist_id / tracks.artist_id have no FK, so a
// half-finished merge would silently orphan rows.
export async function mergeArtistInto(targetId: number, loserId: number, trx: Kysely<Database>): Promise<void> {
  // Relations pointing AT the loser: drop ones the target already has, and
  // any that would become target→target.
  await trx.deleteFrom('artist_relations').where((eb) =>
    eb.and([
      eb('related_artist_id', '=', loserId),
      eb('artist_id', 'in', trx.selectFrom('artist_relations').select('artist_id').where('related_artist_id', '=', targetId)),
    ])
  ).execute()
  await trx.deleteFrom('artist_relations').where('related_artist_id', '=', loserId).where('artist_id', '=', targetId).execute()

  // Relations FROM the loser: same dedupe in the other direction.
  await trx.deleteFrom('artist_relations').where((eb) =>
    eb.and([
      eb('artist_id', '=', loserId),
      eb('related_artist_id', 'in', trx.selectFrom('artist_relations').select('related_artist_id').where('artist_id', '=', targetId)),
    ])
  ).execute()
  await trx.deleteFrom('artist_relations').where('artist_id', '=', loserId).where('related_artist_id', '=', targetId).execute()

  await trx.updateTable('artist_relations').set({ related_artist_id: targetId }).where('related_artist_id', '=', loserId).execute()
  await trx.updateTable('artist_relations').set({ artist_id: targetId }).where('artist_id', '=', loserId).execute()

  // artist_albums.artist_id is ON DELETE CASCADE — transfer credits before updating albums,
  // since albums.artist_id changes trigger sync_artist_albums_on_update which also modifies
  // artist_albums entries. We need to handle deduplication first.
  await trx.deleteFrom('artist_albums').where((eb) =>
    eb.and([
      eb('artist_id', '=', loserId),
      eb('album_id', 'in', trx.selectFrom('artist_albums').select('album_id').where('artist_id', '=', targetId)),
    ])
  ).execute()
  await trx.updateTable('artist_albums').set({ artist_id: targetId }).where('artist_id', '=', loserId).execute()

  // No FK on these two columns — re-point before deleting or they orphan.
  await trx.updateTable('albums').set({ artist_id: targetId }).where('artist_id', '=', loserId).execute()
  await trx.updateTable('tracks').set({ artist_id: targetId }).where('artist_id', '=', loserId).execute()

  await trx.deleteFrom('artists').where('id', '=', loserId).execute()
}

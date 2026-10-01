import type { Kysely } from 'kysely'
import type { Database } from '../db/database.js'
import { reassignFactoids } from './entityDeleteService.js'

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

  // track_artists.artist_id is ON DELETE CASCADE with UNIQUE (track_id,
  // artist_id) — keep the target's existing credit where both are credited,
  // transfer the rest.
  await trx.deleteFrom('track_artists').where((eb) =>
    eb.and([
      eb('artist_id', '=', loserId),
      eb('track_id', 'in', trx.selectFrom('track_artists').select('track_id').where('artist_id', '=', targetId)),
    ])
  ).execute()
  await trx.updateTable('track_artists').set({ artist_id: targetId }).where('artist_id', '=', loserId).execute()

  // images: dedupe against both partial unique indexes BEFORE transferring — mirrors
  // albumMergeService's identical images handling (idx_images_artist_not_found,
  // idx_images_artist_primary). Without this, images.artist_id's ON DELETE CASCADE
  // silently destroyed the loser's images when this function only deleted the loser row.
  await trx
    .deleteFrom('images')
    .where((eb) => eb.and([
      eb('artist_id', '=', loserId),
      eb('status', '=', 'not_found'),
      eb('source', 'in', trx.selectFrom('images').select('source').where('artist_id', '=', targetId).where('status', '=', 'not_found')),
    ]))
    .execute()

  const destPrimaryImage = await trx
    .selectFrom('images')
    .select('id')
    .where('artist_id', '=', targetId)
    .where('is_primary', '=', true)
    .executeTakeFirst()
  if (destPrimaryImage) {
    await trx
      .updateTable('images')
      .set({ is_primary: false })
      .where('artist_id', '=', loserId)
      .where('is_primary', '=', true)
      .execute()
  }

  await trx.updateTable('images').set({ artist_id: targetId }).where('artist_id', '=', loserId).execute()

  if (!destPrimaryImage) {
    const newPrimaryImage = await trx
      .selectFrom('images')
      .leftJoin('media_files', (join) =>
        join.onRef('media_files.entity_id', '=', 'images.id').on('media_files.entity_type', '=', 'image')
      )
      .select('media_files.absolute_path as path')
      .where('images.artist_id', '=', targetId)
      .where('images.is_primary', '=', true)
      .executeTakeFirst()
    if (newPrimaryImage?.path) {
      await trx.updateTable('artists').set({ image_path: newPrimaryImage.path, updated_at: new Date() }).where('id', '=', targetId).execute()
    }
  }

  // favorites (kind='artist'): dedup against UNIQUE(user_id, kind, target_id), then redirect
  await trx
    .deleteFrom('favorites')
    .where((eb) => eb.and([
      eb('kind', '=', 'artist'),
      eb('target_id', '=', loserId),
      eb('user_id', 'in', trx.selectFrom('favorites').select('user_id').where('kind', '=', 'artist').where('target_id', '=', targetId)),
    ]))
    .execute()
  await trx.updateTable('favorites').set({ target_id: targetId }).where('kind', '=', 'artist').where('target_id', '=', loserId).execute()

  // artists_tags (curated tags): dedup, then redirect — mirrors albums_tags in albumMergeService
  await trx
    .deleteFrom('artists_tags')
    .where((eb) => eb.and([
      eb('artist_id', '=', loserId),
      eb('tag_id', 'in', trx.selectFrom('artists_tags').select('tag_id').where('artist_id', '=', targetId)),
    ]))
    .execute()
  await trx.updateTable('artists_tags').set({ artist_id: targetId }).where('artist_id', '=', loserId).execute()

  // artist_mb_tags (MusicBrainz-sourced tags): dedup by tag_id, then redirect the rest.
  // Keep the target's own row where both sides already have the same tag — its
  // tag_count reflects the target's own (still-current) source_mbid.
  await trx
    .deleteFrom('artist_mb_tags')
    .where((eb) => eb.and([
      eb('artist_id', '=', loserId),
      eb('tag_id', 'in', trx.selectFrom('artist_mb_tags').select('tag_id').where('artist_id', '=', targetId)),
    ]))
    .execute()
  await trx.updateTable('artist_mb_tags').set({ artist_id: targetId }).where('artist_id', '=', loserId).execute()

  // factoids/factoid_generations are polymorphic (no FK), so nothing cascades:
  // move them before the loser row goes, or they orphan silently.
  await reassignFactoids('artist', loserId, targetId, trx)

  await trx.deleteFrom('artists').where('id', '=', loserId).execute()
}

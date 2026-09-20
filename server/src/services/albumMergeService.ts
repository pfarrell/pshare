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

  // images: dedupe against both partial unique indexes BEFORE transferring, so the bulk
  // UPDATE never asks either index to hold two rows for targetId at once (both indexes are
  // plain, non-deferrable, and checked per-row — a mid-statement collision throws).
  //
  // idx_images_album_not_found: UNIQUE (album_id, source) WHERE status = 'not_found' — drop
  // any loser-side not_found row whose source the target already has a not_found row for.
  await trx
    .deleteFrom('images')
    .where((eb) => eb.and([
      eb('album_id', '=', loserId),
      eb('status', '=', 'not_found'),
      eb('source', 'in', trx.selectFrom('images').select('source').where('album_id', '=', targetId).where('status', '=', 'not_found')),
    ]))
    .execute()

  // idx_images_album_primary: UNIQUE (album_id, is_primary) WHERE is_primary = true — if the
  // target already has a primary, demote the loser's own primary (at most one, same index)
  // before the transfer, so the two never coexist under targetId even transiently.
  const destPrimary = await trx
    .selectFrom('images')
    .select('id')
    .where('album_id', '=', targetId)
    .where('is_primary', '=', true)
    .executeTakeFirst()
  if (destPrimary) {
    await trx
      .updateTable('images')
      .set({ is_primary: false })
      .where('album_id', '=', loserId)
      .where('is_primary', '=', true)
      .execute()
  }

  await trx.updateTable('images').set({ album_id: targetId }).where('album_id', '=', loserId).execute()

  // albums.image_path is denormalized off the primary images row (kept in sync by
  // entityImagesService's syncParentImagePath whenever a primary image is set directly) —
  // it is NOT a live join, so the transfer above doesn't update it on its own. Only the
  // "target had no primary before" case needs fixing up: the surviving primary is then the
  // loser's former primary, which the target's image_path was never pointed at.
  if (!destPrimary) {
    const newPrimary = await trx
      .selectFrom('images')
      .leftJoin('media_files', (join) =>
        join.onRef('media_files.entity_id', '=', 'images.id').on('media_files.entity_type', '=', 'image')
      )
      .select('media_files.absolute_path as path')
      .where('images.album_id', '=', targetId)
      .where('images.is_primary', '=', true)
      .executeTakeFirst()
    if (newPrimary?.path) {
      await trx.updateTable('albums').set({ image_path: newPrimary.path, updated_at: new Date() }).where('id', '=', targetId).execute()
    }
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

  // artist_albums (secondary artist credits: featured/guest/collaborator/composer/performer,
  // plus the loser's own primary-artist row): ON DELETE CASCADE on album_id would otherwise
  // silently drop these when the loser album is deleted below. Dedup against
  // UNIQUE(artist_id, album_id), then redirect the rest — same shape as collection_albums.
  await trx
    .deleteFrom('artist_albums')
    .where((eb) => eb.and([
      eb('album_id', '=', loserId),
      eb('artist_id', 'in', trx.selectFrom('artist_albums').select('artist_id').where('album_id', '=', targetId)),
    ]))
    .execute()
  await trx.updateTable('artist_albums').set({ album_id: targetId }).where('album_id', '=', loserId).execute()

  await trx.deleteFrom('albums').where('id', '=', loserId).execute()

  return { tracksMoved }
}

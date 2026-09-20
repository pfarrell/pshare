import type { Kysely } from 'kysely'
import type { Database } from '../db/database.js'
import { deletableMediaFileIds } from './entityDeleteService.js'

// Folds `loserId` into `targetId` and deletes the loser. Run inside
// db.transaction(). Same shape as mergeArtistInto/mergeAlbumInto: dedupe
// against every unique constraint before redirecting, transfer everything
// that would otherwise dangle or be cascade-deleted, delete the loser last.
export async function mergeTrackInto(targetId: number, loserId: number, trx: Kysely<Database>): Promise<void> {
  // Captured before the loser row is deleted below — a tier-2 (title-matched,
  // different file) merge can leave the loser's media_files row referenced by
  // nothing at all once the loser track is gone.
  const loser = await trx.selectFrom('tracks').select('media_file_id').where('id', '=', loserId).executeTakeFirst()
  const loserMediaFileId = loser?.media_file_id ?? null
  // playlist_tracks: no unique constraint, but redirecting blindly could
  // put the same track twice in one playlist as a side effect of "cleanup" —
  // dedup anyway, then redirect the rest.
  await trx
    .deleteFrom('playlist_tracks')
    .where((eb) => eb.and([
      eb('track_id', '=', loserId),
      eb('playlist_id', 'in', trx.selectFrom('playlist_tracks').select('playlist_id').where('track_id', '=', targetId)),
    ]))
    .execute()
  await trx.updateTable('playlist_tracks').set({ track_id: targetId }).where('track_id', '=', loserId).execute()

  // favorites (kind='track'): dedup against UNIQUE(user_id, kind, target_id), then redirect
  await trx
    .deleteFrom('favorites')
    .where((eb) => eb.and([
      eb('kind', '=', 'track'),
      eb('target_id', '=', loserId),
      eb('user_id', 'in', trx.selectFrom('favorites').select('user_id').where('kind', '=', 'track').where('target_id', '=', targetId)),
    ]))
    .execute()
  await trx.updateTable('favorites').set({ target_id: targetId }).where('kind', '=', 'track').where('target_id', '=', loserId).execute()

  // notes (kind='track'): plain redirect
  await trx.updateTable('notes').set({ target_id: targetId }).where('kind', '=', 'track').where('target_id', '=', loserId).execute()

  // tags_tracks: no unique constraint, same double-tag rationale as playlist_tracks — dedup, then redirect
  await trx
    .deleteFrom('tags_tracks')
    .where((eb) => eb.and([
      eb('track_id', '=', loserId),
      eb('tag_id', 'in', trx.selectFrom('tags_tracks').select('tag_id').where('track_id', '=', targetId)),
    ]))
    .execute()
  await trx.updateTable('tags_tracks').set({ track_id: targetId }).where('track_id', '=', loserId).execute()

  // track_artists: dedup against UNIQUE(track_id, artist_id), then redirect
  // (preserves featured/guest/collaborator credits that ON DELETE CASCADE
  // would otherwise cleanly but silently remove along with the loser track)
  await trx
    .deleteFrom('track_artists')
    .where((eb) => eb.and([
      eb('track_id', '=', loserId),
      eb('artist_id', 'in', trx.selectFrom('track_artists').select('artist_id').where('track_id', '=', targetId)),
    ]))
    .execute()
  await trx.updateTable('track_artists').set({ track_id: targetId }).where('track_id', '=', loserId).execute()

  await trx.deleteFrom('tracks').where('id', '=', loserId).execute()

  // media_files cleanup: must run AFTER the loser track is deleted, since
  // deletableMediaFileIds checks what's still referenced. In the tier-1 case
  // (target and loser shared the same media_file_id) this correctly reports it's
  // still referenced by the target and does nothing. We only ever delete the DB
  // row here, never the underlying file on disk — same convention as the
  // recording-consolidation script and deleteAlbumsCascade.
  if (loserMediaFileId != null) {
    const deletable = await deletableMediaFileIds([loserMediaFileId], trx)
    if (deletable.length > 0) {
      await trx.deleteFrom('media_files').where('id', 'in', deletable).execute()
    }
  }
}

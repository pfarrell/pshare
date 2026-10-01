import type { Kysely } from 'kysely'
import type { Database } from '../db/database.js'
import { deletableMediaFileIds } from './entityDeleteService.js'

export class CanonicalFileError extends Error {}

// Points every track in `otherTrackIds` at `keepTrackId`'s media_files row. No
// track is removed, merged, or moved: they stay on their albums with their own
// playlists, favorites, notes and tags, and simply share one definitive audio
// file. Run inside db.transaction().
//
// The media_files rows the other tracks used to point at are deleted only when
// nothing references them any more, and only the DB row, never the file on disk
// (same convention as mergeTrackInto and deleteAlbumsCascade).
export async function setCanonicalMediaFile(
  keepTrackId: number,
  otherTrackIds: number[],
  trx: Kysely<Database>,
): Promise<{ repointed: number; mediaFilesRemoved: number }> {
  if (otherTrackIds.length === 0 || otherTrackIds.includes(keepTrackId) || new Set(otherTrackIds).size !== otherTrackIds.length) {
    throw new CanonicalFileError('keep track and other tracks must be distinct')
  }
  const rows = await trx
    .selectFrom('tracks')
    .select(['id', 'media_file_id'])
    .where('id', 'in', [keepTrackId, ...otherTrackIds])
    .execute()
  if (rows.length !== otherTrackIds.length + 1) throw new CanonicalFileError('Track not found (it may have already been deleted)')

  const keep = rows.find((r) => r.id === keepTrackId)!
  if (keep.media_file_id == null) throw new CanonicalFileError('The chosen track has no media file to point the others at')

  const toRepoint = rows.filter((r) => r.id !== keepTrackId && r.media_file_id !== keep.media_file_id)
  if (toRepoint.length > 0) {
    await trx.updateTable('tracks').set({ media_file_id: keep.media_file_id }).where('id', 'in', toRepoint.map((r) => r.id)).execute()
  }

  const oldFileIds = [...new Set(toRepoint.map((r) => r.media_file_id).filter((id): id is number => id != null))]
  const deletable = await deletableMediaFileIds(oldFileIds, trx)
  if (deletable.length > 0) await trx.deleteFrom('media_files').where('id', 'in', deletable).execute()

  return { repointed: toRepoint.length, mediaFilesRemoved: deletable.length }
}

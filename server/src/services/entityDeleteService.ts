// server/src/services/entityDeleteService.ts
import type { Kysely } from 'kysely'
import type { Database } from '../db/database.js'

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

  if (tracks.length > 0) {
    await trx.deleteFrom('tracks').where('album_id', 'in', albumIds).execute()
  }
  const deletable = await deletableMediaFileIds(mediaFileIds, trx)
  if (deletable.length > 0) {
    await trx.deleteFrom('media_files').where('id', 'in', deletable).execute()
  }
  await trx.deleteFrom('albums').where('id', 'in', albumIds).execute()
}

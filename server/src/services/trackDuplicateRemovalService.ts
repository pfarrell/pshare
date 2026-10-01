import type { Kysely } from 'kysely'
import type { Database } from '../db/database.js'
import { mergeTrackInto } from './trackMergeService.js'
import { CanonicalFileError } from './trackCanonicalFileService.js'

// DESTRUCTIVE counterpart to setCanonicalMediaFile: deletes every track in
// `removeTrackIds`, keeping `keepTrackId`. Each removed track's playlist entries,
// favorites, notes, tags, credits and factoids are carried over to the kept track
// by mergeTrackInto first. Run inside db.transaction() so a failure removes nothing.
export async function removeDuplicateTracks(
  keepTrackId: number,
  removeTrackIds: number[],
  trx: Kysely<Database>,
): Promise<{ removed: number }> {
  if (removeTrackIds.length === 0 || removeTrackIds.includes(keepTrackId) || new Set(removeTrackIds).size !== removeTrackIds.length) {
    throw new CanonicalFileError('keep track and tracks to remove must be distinct')
  }
  const existing = await trx.selectFrom('tracks').select(['id', 'album_id']).where('id', 'in', [keepTrackId, ...removeTrackIds]).execute()
  if (existing.length !== removeTrackIds.length + 1) throw new CanonicalFileError('Track not found (it may have already been deleted)')
  // The same recording on a different release is not a duplicate to delete: that track
  // belongs to its own album. Those are consolidated (setCanonicalMediaFile), never removed.
  const keepAlbum = existing.find((t) => t.id === keepTrackId)!.album_id
  if (existing.some((t) => t.id !== keepTrackId && t.album_id !== keepAlbum)) {
    throw new CanonicalFileError('Only tracks on the same album as the kept track can be removed')
  }

  for (const id of removeTrackIds) await mergeTrackInto(keepTrackId, id, trx)
  return { removed: removeTrackIds.length }
}

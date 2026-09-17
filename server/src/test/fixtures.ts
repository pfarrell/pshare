// server/src/test/fixtures.ts
// Throwaway rows for DB-backed characterization tests. Everything is named
// with a per-process prefix so cleanup can find exactly what a run created.
import { db } from '../db/database.js'

const PREFIX = `__dry_test_${process.pid}_${Date.now()}_`

export const fixtureName = (label: string) => `${PREFIX}${label}`

export const createArtist = (label: string) =>
  db.insertInto('artists').values({ name: fixtureName(label) }).returningAll().executeTakeFirstOrThrow()

export const createAlbum = (label: string, artistId: number) =>
  db.insertInto('albums').values({ title: fixtureName(label), artist_id: artistId }).returningAll().executeTakeFirstOrThrow()

export const createMediaFile = (label: string) =>
  db.insertInto('media_files')
    .values({
      name: fixtureName(label),
      absolute_path: `/tmp/${fixtureName(label)}.mp3`,
      file_type: 'mp3',
      discriminator: 'track',
      created_at: new Date(),
      updated_at: new Date(),
    })
    .returningAll()
    .executeTakeFirstOrThrow()

export const createTrack = (label: string, albumId: number, artistId: number | null, mediaFileId: number | null = null) =>
  db.insertInto('tracks')
    .values({ title: fixtureName(label), album_id: albumId, artist_id: artistId, media_file_id: mediaFileId })
    .returningAll()
    .executeTakeFirstOrThrow()

export async function cleanupFixtures(): Promise<void> {
  const like = `${PREFIX}%`
  const artistIds = (await db.selectFrom('artists').select('id').where('name', 'like', like).execute()).map((r) => r.id)
  const albumIds = (await db.selectFrom('albums').select('id').where('title', 'like', like).execute()).map((r) => r.id)

  // Image media_files rows point at images by entity_id with no FK.
  // Need to delete image media_files that reference fixture images.
  if (artistIds.length > 0) {
    const imageIds = (await db.selectFrom('images').select('id').where('artist_id', 'in', artistIds).execute()).map((r) => r.id)
    if (imageIds.length > 0) {
      await db.deleteFrom('media_files').where('entity_type', '=', 'image').where('entity_id', 'in', imageIds).execute()
    }
  }

  if (albumIds.length > 0) {
    const imageIds = (await db.selectFrom('images').select('id').where('album_id', 'in', albumIds).execute()).map((r) => r.id)
    if (imageIds.length > 0) {
      await db.deleteFrom('media_files').where('entity_type', '=', 'image').where('entity_id', 'in', imageIds).execute()
    }
  }

  await db.deleteFrom('tracks').where('title', 'like', like).execute()
  if (albumIds.length > 0) await db.deleteFrom('albums').where('id', 'in', albumIds).execute()
  await db.deleteFrom('media_files').where('name', 'like', like).execute()
  if (artistIds.length > 0) await db.deleteFrom('artists').where('id', 'in', artistIds).execute()
}

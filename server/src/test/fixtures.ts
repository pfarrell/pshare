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

export const createUser = (label: string, { password = null, admin = false }: { password?: string | null, admin?: boolean } = {}) =>
  db.insertInto('users')
    .values({ username: fixtureName(label), password, admin, email: null })
    .returningAll()
    .executeTakeFirstOrThrow()

export const createJukeboxDevice = (label: string, userId: number) =>
  db.insertInto('jukebox_devices')
    .values({ user_id: userId, name: fixtureName(label) })
    .returningAll()
    .executeTakeFirstOrThrow()

export const createLog = (albumId: number, trackId: number | null, artistId: number | null, createdAt: Date) =>
  db.insertInto('logs')
    .values({ album_id: albumId, track_id: trackId, artist_id: artistId, action: 'stream', created_at: createdAt, ip_address: null })
    .execute()

export const createTag = (label: string) =>
  db.insertInto('tags').values({ name: fixtureName(label) }).returningAll().executeTakeFirstOrThrow()

export const tagAlbum = (albumId: number, tagId: number) =>
  db.insertInto('albums_tags').values({ album_id: albumId, tag_id: tagId }).execute()

export const tagArtist = (artistId: number, tagId: number) =>
  db.insertInto('artists_tags').values({ artist_id: artistId, tag_id: tagId }).execute()

export const tagTrack = (trackId: number, tagId: number) =>
  db.insertInto('tags_tracks').values({ track_id: trackId, tag_id: tagId }).execute()

export const createPlaylist = (label: string) =>
  db.insertInto('playlists').values({ name: fixtureName(label) }).returningAll().executeTakeFirstOrThrow()

export const createCollection = (label: string) =>
  db.insertInto('collections').values({ name: fixtureName(label) }).returningAll().executeTakeFirstOrThrow()

export const createProfile = (label: string, tagIds: number[]) =>
  db.insertInto('profiles').values({ name: fixtureName(label) }).returningAll().executeTakeFirstOrThrow()
    .then(async (profile) => {
      if (tagIds.length > 0) {
        await db.insertInto('profile_tags').values(tagIds.map((tag_id) => ({ profile_id: profile.id, tag_id }))).execute()
      }
      return profile
    })

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
  if (albumIds.length > 0) await db.deleteFrom('logs').where('album_id', 'in', albumIds).execute()
  if (albumIds.length > 0) await db.deleteFrom('albums').where('id', 'in', albumIds).execute()
  await db.deleteFrom('media_files').where('name', 'like', like).execute()
  if (artistIds.length > 0) await db.deleteFrom('artists').where('id', 'in', artistIds).execute()

  const tagIds = (await db.selectFrom('tags').select('id').where('name', 'like', like).execute()).map((r) => r.id)
  if (tagIds.length > 0) await db.deleteFrom('tags').where('id', 'in', tagIds).execute()

  const profileIds = (await db.selectFrom('profiles').select('id').where('name', 'like', like).execute()).map((r) => r.id)
  if (profileIds.length > 0) await db.deleteFrom('profiles').where('id', 'in', profileIds).execute()

  const playlistIds = (await db.selectFrom('playlists').select('id').where('name', 'like', like).execute()).map((r) => r.id)
  if (playlistIds.length > 0) await db.deleteFrom('playlists').where('id', 'in', playlistIds).execute()

  const collectionIds = (await db.selectFrom('collections').select('id').where('name', 'like', like).execute()).map((r) => r.id)
  if (collectionIds.length > 0) await db.deleteFrom('collections').where('id', 'in', collectionIds).execute()

  const userIds = (await db.selectFrom('users').select('id').where('username', 'like', like).execute()).map((r) => r.id)
  if (userIds.length > 0) {
    await db.deleteFrom('jukebox_devices').where('user_id', 'in', userIds).execute()
    await db.deleteFrom('users').where('id', 'in', userIds).execute()
  }
}

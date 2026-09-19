// server/src/services/entityDeleteService.test.ts
import 'dotenv/config'
import { test, after } from 'node:test'
import assert from 'node:assert/strict'
import { db } from '../db/database.js'
import { createArtist, createAlbum, createMediaFile, createTrack, cleanupFixtures } from '../test/fixtures.js'
import { deleteAlbumsCascade } from './entityDeleteService.js'

after(cleanupFixtures)

test('deletes albums, their tracks, and only media files no other track uses', async () => {
  const artist = await createArtist('delete-artist')
  const doomed = await createAlbum('delete-doomed', artist.id)
  const survivor = await createAlbum('delete-survivor', artist.id)
  const exclusive = await createMediaFile('delete-exclusive')
  const shared = await createMediaFile('delete-shared')
  const t1 = await createTrack('delete-t1', doomed.id, artist.id, exclusive.id)
  await createTrack('delete-t2', doomed.id, artist.id, shared.id)
  await createTrack('delete-t3', survivor.id, artist.id, shared.id)

  await db.transaction().execute((trx) => deleteAlbumsCascade([doomed.id], trx))

  assert.equal(await db.selectFrom('albums').select('id').where('id', '=', doomed.id).executeTakeFirst(), undefined)
  assert.equal(await db.selectFrom('tracks').select('id').where('id', '=', t1.id).executeTakeFirst(), undefined)
  assert.equal(await db.selectFrom('media_files').select('id').where('id', '=', exclusive.id).executeTakeFirst(), undefined)
  assert.ok(await db.selectFrom('media_files').select('id').where('id', '=', shared.id).executeTakeFirst())
  assert.ok(await db.selectFrom('albums').select('id').where('id', '=', survivor.id).executeTakeFirst())
})

test('no-op for an empty id list', async () => {
  await db.transaction().execute((trx) => deleteAlbumsCascade([], trx))
})

test('rolls back with the surrounding transaction', async () => {
  const artist = await createArtist('delete-rollback')
  const album = await createAlbum('delete-rollback-album', artist.id)
  await createTrack('delete-rollback-track', album.id, artist.id)
  await assert.rejects(db.transaction().execute(async (trx) => {
    await deleteAlbumsCascade([album.id], trx)
    throw new Error('boom')
  }))
  assert.ok(await db.selectFrom('albums').select('id').where('id', '=', album.id).executeTakeFirst())
})

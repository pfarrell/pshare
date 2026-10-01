import 'dotenv/config'
import { test, after } from 'node:test'
import assert from 'node:assert/strict'
import { db } from '../db/database.js'
import { createArtist, createAlbum, createMediaFile, createTrack, cleanupFixtures } from '../test/fixtures.js'
import { setCanonicalMediaFile, CanonicalFileError } from './trackCanonicalFileService.js'

after(cleanupFixtures)

const fileOf = async (trackId: number) =>
  (await db.selectFrom('tracks').select('media_file_id').where('id', '=', trackId).executeTakeFirstOrThrow()).media_file_id
const fileExists = async (id: number) =>
  !!(await db.selectFrom('media_files').select('id').where('id', '=', id).executeTakeFirst())

test('other tracks keep existing and point at the chosen track\'s file; their orphaned files are removed', async () => {
  const artist = await createArtist('canon-artist')
  const album = await createAlbum('canon-album', artist.id)
  const keepFile = await createMediaFile('canon-keep')
  const oldA = await createMediaFile('canon-old-a')
  const oldB = await createMediaFile('canon-old-b')
  const keep = await createTrack('canon-keep', album.id, artist.id, keepFile.id)
  const a = await createTrack('canon-a', album.id, artist.id, oldA.id)
  const b = await createTrack('canon-b', album.id, artist.id, oldB.id)

  const result = await db.transaction().execute((trx) => setCanonicalMediaFile(keep.id, [a.id, b.id], trx))

  assert.deepEqual(result, { repointed: 2, mediaFilesRemoved: 2 })
  assert.equal(await fileOf(a.id), keepFile.id)
  assert.equal(await fileOf(b.id), keepFile.id)
  assert.equal(await fileOf(keep.id), keepFile.id)
  const remaining = await db.selectFrom('tracks').select('id').where('album_id', '=', album.id).execute()
  assert.equal(remaining.length, 3, 'no track is deleted')
  assert.equal(await fileExists(keepFile.id), true)
  assert.equal(await fileExists(oldA.id), false)
  assert.equal(await fileExists(oldB.id), false)
})

test('an old media file still used by a track outside the group is kept', async () => {
  const artist = await createArtist('canonshared-artist')
  const album = await createAlbum('canonshared-album', artist.id)
  const otherAlbum = await createAlbum('canonshared-other', artist.id)
  const keepFile = await createMediaFile('canonshared-keep')
  const sharedOld = await createMediaFile('canonshared-old')
  const keep = await createTrack('canonshared-keep', album.id, artist.id, keepFile.id)
  const a = await createTrack('canonshared-a', album.id, artist.id, sharedOld.id)
  const elsewhere = await createTrack('canonshared-elsewhere', otherAlbum.id, artist.id, sharedOld.id)

  const result = await db.transaction().execute((trx) => setCanonicalMediaFile(keep.id, [a.id], trx))

  assert.deepEqual(result, { repointed: 1, mediaFilesRemoved: 0 })
  assert.equal(await fileExists(sharedOld.id), true)
  assert.equal(await fileOf(elsewhere.id), sharedOld.id)
})

test('tracks already on the chosen file are left alone', async () => {
  const artist = await createArtist('canonsame-artist')
  const album = await createAlbum('canonsame-album', artist.id)
  const file = await createMediaFile('canonsame-file')
  const keep = await createTrack('canonsame-keep', album.id, artist.id, file.id)
  const a = await createTrack('canonsame-a', album.id, artist.id, file.id)

  const result = await db.transaction().execute((trx) => setCanonicalMediaFile(keep.id, [a.id], trx))

  assert.deepEqual(result, { repointed: 0, mediaFilesRemoved: 0 })
  assert.equal(await fileExists(file.id), true)
})

test('refuses a keeper with no media file, missing tracks, and bad input, changing nothing', async () => {
  const artist = await createArtist('canonbad-artist')
  const album = await createAlbum('canonbad-album', artist.id)
  const file = await createMediaFile('canonbad-file')
  const noFile = await createTrack('canonbad-nofile', album.id, artist.id, null)
  const withFile = await createTrack('canonbad-withfile', album.id, artist.id, file.id)

  await assert.rejects(db.transaction().execute((trx) => setCanonicalMediaFile(noFile.id, [withFile.id], trx)), CanonicalFileError)
  await assert.rejects(db.transaction().execute((trx) => setCanonicalMediaFile(withFile.id, [999999999], trx)), CanonicalFileError)
  await assert.rejects(db.transaction().execute((trx) => setCanonicalMediaFile(withFile.id, [], trx)), CanonicalFileError)
  await assert.rejects(db.transaction().execute((trx) => setCanonicalMediaFile(withFile.id, [withFile.id], trx)), CanonicalFileError)
  assert.equal(await fileOf(withFile.id), file.id)
})

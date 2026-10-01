import 'dotenv/config'
import { test, after } from 'node:test'
import assert from 'node:assert/strict'
import { db } from '../db/database.js'
import { createArtist, createAlbum, createMediaFile, createTrack, createUser, createFavorite, cleanupFixtures } from '../test/fixtures.js'
import { removeDuplicateTracks } from './trackDuplicateRemovalService.js'
import { CanonicalFileError } from './trackCanonicalFileService.js'

after(cleanupFixtures)

const trackIds = async (albumId: number) =>
  (await db.selectFrom('tracks').select('id').where('album_id', '=', albumId).execute()).map((r) => r.id).sort((a, b) => a - b)

test('removes the other tracks, keeps the chosen one, and carries favorites over', async () => {
  const artist = await createArtist('rmdup-artist')
  const album = await createAlbum('rmdup-album', artist.id)
  const user = await createUser('rmdup-user')
  const fileKeep = await createMediaFile('rmdup-keep')
  const fileA = await createMediaFile('rmdup-a')
  const keep = await createTrack('rmdup-keep', album.id, artist.id, fileKeep.id)
  const a = await createTrack('rmdup-a', album.id, artist.id, fileA.id)
  const b = await createTrack('rmdup-b', album.id, artist.id, fileKeep.id)
  await createFavorite(user.id, 'track', a.id)

  const result = await db.transaction().execute((trx) => removeDuplicateTracks(keep.id, [a.id, b.id], trx))

  assert.deepEqual(result, { removed: 2 })
  assert.deepEqual(await trackIds(album.id), [keep.id])
  const fav = await db.selectFrom('favorites').select('target_id').where('user_id', '=', user.id).where('kind', '=', 'track').executeTakeFirst()
  assert.equal(fav?.target_id, keep.id, 'the removed track\'s favorite moves to the kept track')
  assert.ok(await db.selectFrom('media_files').select('id').where('id', '=', fileKeep.id).executeTakeFirst(), 'the kept file stays')
})

test('refuses bad input and missing tracks, removing nothing', async () => {
  const artist = await createArtist('rmdupbad-artist')
  const album = await createAlbum('rmdupbad-album', artist.id)
  const keep = await createTrack('rmdupbad-keep', album.id, artist.id)
  const other = await createTrack('rmdupbad-other', album.id, artist.id)

  await assert.rejects(db.transaction().execute((trx) => removeDuplicateTracks(keep.id, [], trx)), CanonicalFileError)
  await assert.rejects(db.transaction().execute((trx) => removeDuplicateTracks(keep.id, [keep.id], trx)), CanonicalFileError)
  await assert.rejects(db.transaction().execute((trx) => removeDuplicateTracks(keep.id, [other.id, 999999999], trx)), CanonicalFileError)
  assert.deepEqual(await trackIds(album.id), [keep.id, other.id].sort((x, y) => x - y))
})

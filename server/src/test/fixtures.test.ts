// server/src/test/fixtures.test.ts
import 'dotenv/config'
import { test, after } from 'node:test'
import assert from 'node:assert/strict'
import { db } from '../db/database.js'
import { createArtist, createAlbum, createMediaFile, createTrack, cleanupFixtures, fixtureName } from './fixtures.js'

after(cleanupFixtures)

test('fixtures create rows and cleanupFixtures removes them', async () => {
  const artist = await createArtist('artist')
  const album = await createAlbum('album', artist.id)
  const media = await createMediaFile('media')
  const track = await createTrack('track', album.id, artist.id, media.id)
  assert.ok(artist.name.startsWith('__dry_test_'))
  assert.equal(track.album_id, album.id)

  await cleanupFixtures()

  const leftover = await db.selectFrom('artists').select('id').where('name', 'like', `${fixtureName('')}%`).execute()
  assert.equal(leftover.length, 0)
  assert.equal(await db.selectFrom('media_files').select('id').where('id', '=', media.id).executeTakeFirst(), undefined)
})

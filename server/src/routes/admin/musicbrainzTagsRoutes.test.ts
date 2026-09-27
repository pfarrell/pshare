// server/src/routes/admin/musicbrainzTagsRoutes.test.ts
import 'dotenv/config'
import { test, after } from 'node:test'
import assert from 'node:assert/strict'
import { Hono } from 'hono'
import { db } from '../../db/database.js'
import { createArtist, createAlbum, cleanupFixtures } from '../../test/fixtures.js'
import artistsRouter from './artists.js'
import albumsRouter from './albums.js'

after(cleanupFixtures)

const app = new Hono()
app.route('/', artistsRouter)
app.route('/', albumsRouter)

test('GET /artist/:id/mb-tags returns captured tags ordered by count desc', async () => {
  const artist = await createArtist('mb-tags-route-artist')
  const tag1 = await db.insertInto('mb_tags').values({ name: `route-tag-a-${process.pid}` }).returningAll().executeTakeFirstOrThrow()
  const tag2 = await db.insertInto('mb_tags').values({ name: `route-tag-b-${process.pid}` }).returningAll().executeTakeFirstOrThrow()
  await db.insertInto('artist_mb_tags').values([
    { artist_id: artist.id, source_mbid: 'x', tag_id: tag1.id, tag_count: 2 },
    { artist_id: artist.id, source_mbid: 'x', tag_id: tag2.id, tag_count: 9 },
  ]).execute()

  const res = await app.request(`/artist/${artist.id}/mb-tags`)
  const body = await res.json()
  assert.equal(res.status, 200)
  assert.deepEqual(body.tags.map((t: any) => t.name), [tag2.name, tag1.name])
})

test('GET /album/:id/mb-tags returns an empty list for an album with no captured tags', async () => {
  const artist = await createArtist('mb-tags-route-album-artist')
  const album = await createAlbum('mb-tags-route-album', artist.id)

  const res = await app.request(`/album/${album.id}/mb-tags`)
  const body = await res.json()
  assert.equal(res.status, 200)
  assert.deepEqual(body.tags, [])
})

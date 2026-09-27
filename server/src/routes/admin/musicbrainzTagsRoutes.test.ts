// server/src/routes/admin/musicbrainzTagsRoutes.test.ts
import 'dotenv/config'
import { test, after } from 'node:test'
import assert from 'node:assert/strict'
import { Hono } from 'hono'
import { db } from '../../db/database.js'
import { createArtist, createAlbum, cleanupFixtures } from '../../test/fixtures.js'
import { applyArtistTags, applyAlbumTags } from '../../services/musicbrainzTags.js'
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

test('PUT /admin/artist/:id clearing the MBID deletes previously-captured tags', async () => {
  const artist = await createArtist('mb-tags-clear-artist')
  await applyArtistTags(artist.id, 'mbid-clear-artist-1', [{ name: 'rock', count: 5 }])
  await db
    .updateTable('artists')
    .set({ musicbrainz_id: 'mbid-clear-artist-1', mbid_status: 'manual', mbid_confidence: 1.0 })
    .where('id', '=', artist.id)
    .execute()

  const before = await db.selectFrom('artist_mb_tags').selectAll().where('artist_id', '=', artist.id).execute()
  assert.equal(before.length, 1)

  const res = await app.request(`/artist/${artist.id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: artist.name, musicbrainz_id: '' }),
  })
  const body = await res.json()
  assert.equal(res.status, 200)
  assert.equal(body.musicbrainz_id, null)

  const after = await db.selectFrom('artist_mb_tags').selectAll().where('artist_id', '=', artist.id).execute()
  assert.equal(after.length, 0)
})

test('PUT /admin/album/:id clearing the MBID deletes previously-captured tags', async () => {
  const artist = await createArtist('mb-tags-clear-album-artist')
  const album = await createAlbum('mb-tags-clear-album', artist.id)
  await applyAlbumTags(album.id, 'release-mbid-clear-1', [{ name: 'live', count: 3 }])
  await db
    .updateTable('albums')
    .set({ musicbrainz_id: 'release-mbid-clear-1', mbid_status: 'manual', mbid_confidence: 1.0 })
    .where('id', '=', album.id)
    .execute()

  const before = await db.selectFrom('album_mb_tags').selectAll().where('album_id', '=', album.id).execute()
  assert.equal(before.length, 1)

  const res = await app.request(`/album/${album.id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ title: album.title, artist_id: artist.id, musicbrainz_id: '' }),
  })
  const body = await res.json()
  assert.equal(res.status, 200)
  assert.equal(body.musicbrainz_id, null)

  const after = await db.selectFrom('album_mb_tags').selectAll().where('album_id', '=', album.id).execute()
  assert.equal(after.length, 0)
})

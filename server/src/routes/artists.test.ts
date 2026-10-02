// server/src/routes/artists.test.ts
import 'dotenv/config'
import { test, after } from 'node:test'
import assert from 'node:assert/strict'
import { Hono } from 'hono'
import artists from './artists.js'
import { createArtist, createAlbum, createTrack, createTag, tagArtist, createProfile, cleanupFixtures } from '../test/fixtures.js'
import { db } from '../db/database.js'

after(cleanupFixtures)

const appWithUser = (user: any = { id: 1, admin: false }) => {
  const app = new Hono()
  app.use('*', async (c, next) => { if (user) c.set('user' as never, user as never); await next() })
  app.route('/artists', artists)
  return app
}

test('GET /artists/random?profileId= only returns artists tagged with one of the profile\'s tags', async () => {
  const matching = await createArtist('random-profile-matching')
  const nonMatching = await createArtist('random-profile-nonmatching')
  await db.updateTable('artists').set({ image_path: '/fixture.jpg' }).where('id', 'in', [matching.id, nonMatching.id]).execute()
  await createAlbum('random-profile-matching-album', matching.id)
  await createAlbum('random-profile-nonmatching-album', nonMatching.id)
  const tag = await createTag('random-profile-tag')
  await tagArtist(matching.id, tag.id)

  const profile = await createProfile('random-profile', [tag.id])

  const res = await appWithUser().request(`/artists/random?size=50&profileId=${profile.id}`)
  const body = await res.json()
  const ids = body.map((a: any) => a.id)

  assert.ok(ids.includes(matching.id))
  assert.equal(ids.includes(nonMatching.id), false)
})

test('GET /artists/random?profileId= for a nonexistent profile returns no artists', async () => {
  const res = await appWithUser().request('/artists/random?size=50&profileId=999999999')
  const body = await res.json()
  assert.deepEqual(body, [])
})

test('GET /artists/random?profileId= with a non-numeric value returns no artists, not a 500', async () => {
  // A NaN profileId used to reach Postgres as an integer bind and throw.
  const res = await appWithUser().request('/artists/random?size=50&profileId=not-a-number')
  assert.equal(res.status, 200)
  assert.deepEqual(await res.json(), [])
})

test('GET /artists/:id lists an album in appears_on when the artist has a stray primary credit on someone else\'s album', async () => {
  const various = await createArtist('appears-various')
  const member = await createArtist('appears-member')
  const album = await createAlbum('appears-comp', various.id)
  await db.insertInto('artist_albums').values({ artist_id: member.id, album_id: album.id, role: 'primary' }).execute()

  const res = await appWithUser().request(`/artists/${member.id}`)
  const body = await res.json()
  assert.ok(body.appears_on.some((a: any) => a.id === album.id))
})

test('GET /artists/:id albums: own and collaborator albums with approved tracks, once each, nothing else', async () => {
  const artist = await createArtist('disco-artist')
  const other = await createArtist('disco-other')
  const own = await createAlbum('disco-own', artist.id)
  const collab = await createAlbum('disco-collab', other.id)
  const hidden = await createAlbum('disco-unapproved-only', artist.id)
  const empty = await createAlbum('disco-no-tracks', artist.id)
  const unrelated = await createAlbum('disco-unrelated', other.id)
  await db.insertInto('artist_albums').values({ artist_id: artist.id, album_id: collab.id, role: 'collaborator' }).execute()

  // several approved tracks on one album must still yield one album row
  for (const n of [1, 2, 3]) await createTrack(`disco-own-${n}`, own.id, artist.id)
  await createTrack('disco-collab-1', collab.id, other.id)
  await createTrack('disco-unrelated-1', unrelated.id, other.id)
  const unapproved = await createTrack('disco-unapproved-1', hidden.id, artist.id)
  await db.updateTable('tracks').set({ approved: false }).where('id', '=', unapproved.id).execute()

  const res = await appWithUser().request(`/artists/${artist.id}`)
  assert.equal(res.status, 200)
  const body = await res.json()
  const ids = body.albums.map((a: any) => a.id)

  assert.deepEqual([...ids].sort((a, b) => a - b), [own.id, collab.id].sort((a, b) => a - b))
  assert.equal(body.albums.find((a: any) => a.id === own.id).track_count, 3)
  assert.equal(ids.includes(hidden.id) || ids.includes(empty.id) || ids.includes(unrelated.id), false)
})

test('POST /artists/:id/tracks/random draws from own and collaborator albums only', async () => {
  const artist = await createArtist('shuffle-artist')
  const other = await createArtist('shuffle-other')
  const own = await createAlbum('shuffle-own', artist.id)
  const collab = await createAlbum('shuffle-collab', other.id)
  const unrelated = await createAlbum('shuffle-unrelated', other.id)
  await db.insertInto('artist_albums').values({ artist_id: artist.id, album_id: collab.id, role: 'collaborator' }).execute()
  const t1 = await createTrack('shuffle-own-1', own.id, artist.id)
  const t2 = await createTrack('shuffle-collab-1', collab.id, other.id)
  const t3 = await createTrack('shuffle-unrelated-1', unrelated.id, other.id)

  const res = await appWithUser().request(`/artists/${artist.id}/tracks/random`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ limit: 50 }),
  })
  const ids = (await res.json()).tracks.map((t: any) => t.id)

  assert.deepEqual([...ids].sort((a, b) => a - b), [t1.id, t2.id].sort((a, b) => a - b))
  assert.equal(ids.includes(t3.id), false)
})

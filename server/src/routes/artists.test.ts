// server/src/routes/artists.test.ts
import 'dotenv/config'
import { test, after } from 'node:test'
import assert from 'node:assert/strict'
import { Hono } from 'hono'
import artists from './artists.js'
import { createArtist, createAlbum, createTag, tagArtist, createProfile, cleanupFixtures } from '../test/fixtures.js'
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

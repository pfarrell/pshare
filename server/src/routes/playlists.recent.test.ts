import 'dotenv/config'
import { test, after } from 'node:test'
import assert from 'node:assert/strict'
import { Hono } from 'hono'
import playlistsRouter from './playlists.js'
import { requireAuth } from '../middleware/auth.js'
import { createPlaylist, createPlaylistLog, cleanupFixtures } from '../test/fixtures.js'

after(cleanupFixtures)

const appWithUser = (user: any = { id: 1 }) => {
  const app = new Hono()
  app.use('*', async (c, next) => { if (user) c.set('user' as never, user as never); await next() })
  app.use('*', requireAuth)
  app.route('/', playlistsRouter)
  return app
}

test('GET /recent requires a logged-in session', async () => {
  const res = await appWithUser(null).request('/recent')
  assert.equal(res.status, 401)
})

test('GET /recent is not swallowed by /:id and returns played playlists with last_played', async () => {
  const playlist = await createPlaylist('recent-route')
  await createPlaylistLog(playlist.id, null, null, null, new Date())

  const res = await appWithUser().request('/recent?size=200')
  assert.equal(res.status, 200)
  const body = await res.json() as any[]
  const found = body.find((p) => p.id === playlist.id)
  assert.ok(found)
  assert.equal(found.track_count, 0)
  assert.ok(!Number.isNaN(Date.parse(found.last_played)))
})

test('GET /recent tolerates a garbage size', async () => {
  const res = await appWithUser().request('/recent?size=abc')
  assert.equal(res.status, 200)
})

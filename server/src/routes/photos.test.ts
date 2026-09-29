import 'dotenv/config'
import { test, after } from 'node:test'
import assert from 'node:assert/strict'
import { Hono } from 'hono'
import photosRouter from './photos.js'
import { requireAuth } from '../middleware/auth.js'
import { db } from '../db/database.js'
import { photosService } from '../services/photosService.js'

const createdIds: number[] = []

after(async () => {
  if (createdIds.length > 0) {
    await db.deleteFrom('media_files').where('entity_type', '=', 'photo').where('entity_id', 'in', createdIds).execute()
    await db.deleteFrom('photos').where('id', 'in', createdIds).execute()
  }
})

const appWithUser = (user: any = { id: 1 }) => {
  const app = new Hono()
  app.use('*', async (c, next) => { if (user) c.set('user' as never, user as never); await next() })
  app.use('*', requireAuth)
  app.route('/', photosRouter)
  return app
}

test('GET /photos/random requires a logged-in session', async () => {
  const res = await appWithUser(null).request('/random')
  assert.equal(res.status, 401)
})

test('GET /photos/random returns a size-bounded JSON array', async () => {
  // Not asserting the table is empty here: this test file's process runs
  // concurrently with photosService.test.ts and admin/photos.test.ts
  // (Node's test runner runs separate files in parallel by default) against
  // the same shared dev database, so an ambient "no photos" assumption
  // would be racy — and would break permanently the first time someone
  // uploads a real photo to try the feature by hand in dev. The client's
  // handling of a genuinely empty response is covered without this
  // constraint by JukeboxScreensaver.test.jsx's "renders nothing when the
  // photo pool is empty" (apiService mocked there, not a real shared table).
  const res = await appWithUser().request('/random?size=5')
  assert.equal(res.status, 200)
  const body = await res.json()
  assert.ok(Array.isArray(body))
  assert.ok(body.length <= 5)
})

test('GET /photos/random respects the size parameter', async () => {
  for (const label of ['a', 'b', 'c']) {
    const photo = await photosService.create(10, 10, `test-random-route-${label}.jpg`)
    createdIds.push(photo.id)
  }

  const res = await appWithUser().request('/random?size=2')

  assert.equal(res.status, 200)
  const body = await res.json()
  assert.equal(body.length, 2)
  assert.ok(body[0].image_path)
})

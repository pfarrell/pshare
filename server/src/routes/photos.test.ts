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

test('GET /photos/random returns an empty array when there are no photos', async () => {
  const res = await appWithUser().request('/random?size=5')
  assert.equal(res.status, 200)
  assert.deepEqual(await res.json(), [])
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

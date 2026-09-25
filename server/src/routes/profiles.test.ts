import 'dotenv/config'
import { test, after } from 'node:test'
import assert from 'node:assert/strict'
import { Hono } from 'hono'
import profiles from './profiles.js'
import { createTag, createProfile, cleanupFixtures } from '../test/fixtures.js'

after(cleanupFixtures)

const appWithUser = (user: any = { id: 1, admin: false }) => {
  const app = new Hono()
  app.use('*', async (c, next) => { if (user) c.set('user' as never, user as never); await next() })
  app.route('/profiles', profiles)
  return app
}

test('GET /profiles requires auth', async () => {
  const res = await appWithUser(null).request('/profiles')
  assert.equal(res.status, 401)
})

test('GET /profiles returns all profiles with their tags', async () => {
  const tag = await createTag('route-list-tag')
  const profile = await createProfile('route-list-profile', [tag.id])

  const res = await appWithUser().request('/profiles')
  assert.equal(res.status, 200)
  const body = await res.json()
  const found = body.find((p: any) => p.id === profile.id)
  assert.ok(found)
  assert.deepEqual(found.tags.map((t: any) => t.id), [tag.id])
})

import 'dotenv/config'
import { test, after } from 'node:test'
import assert from 'node:assert/strict'
import { Hono } from 'hono'
import search from './search.js'
import { createTag, createProfile, cleanupFixtures } from '../test/fixtures.js'

after(cleanupFixtures)

// search.ts itself has no requireAuth call — auth is applied one layer up,
// by index.ts's protectedApp wrapper — so a standalone mount here just needs
// a user set in context, matching the pattern used by artists.test.ts /
// profiles.test.ts for the same reason.
const appWithUser = (user: any = { id: 1, admin: false }) => {
  const app = new Hono()
  app.use('*', async (c, next) => { if (user) c.set('user' as never, user as never); await next() })
  app.route('/search', search)
  return app
}

test('GET /search?profileId= for a nonexistent profile returns 400, not a silently-empty result set', async () => {
  const res = await appWithUser().request('/search?q=abcdef&profileId=999999999')
  assert.equal(res.status, 400)
  const body = await res.json()
  assert.ok(body.error)
})

test('GET /search?profileId= with a non-numeric value returns 400', async () => {
  const res = await appWithUser().request('/search?q=abcdef&profileId=not-a-number')
  assert.equal(res.status, 400)
  const body = await res.json()
  assert.ok(body.error)
})

test('GET /search?profileId= for a real profile still returns results (200)', async () => {
  const tag = await createTag('search-route-profile-tag')
  const profile = await createProfile('search-route-profile', [tag.id])

  const res = await appWithUser().request(`/search?q=abcdef&profileId=${profile.id}`)
  assert.equal(res.status, 200)
  const body = await res.json()
  assert.ok(Array.isArray(body.results))
})

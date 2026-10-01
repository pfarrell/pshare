// server/src/routes/factoids.test.ts
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { Hono } from 'hono'
import { createFactoidsRoutes, type FactoidRouteDeps } from './factoids.js'

const row = (over = {}) => ({
  id: 1, kind: 'album', target_id: 10, text: 'A fact.',
  source_url: 'https://example.com/a', source_title: 'Src',
  created_at: new Date('2026-09-30T00:00:00Z'), subject: 'Aja', ...over,
})

const makeApp = (over: Partial<FactoidRouteDeps> = {}) => {
  const calls: Record<string, unknown[]> = { listForTrack: [], randomFactoids: [] }
  const deps: FactoidRouteDeps = {
    listForTrack: async (...args: unknown[]) => { calls.listForTrack.push(args); return [row()] as never },
    randomFactoids: async (...args: unknown[]) => { calls.randomFactoids.push(args); return [row({ id: 2 })] as never },
    ...over,
  }
  const app = new Hono()
  app.route('/factoids', createFactoidsRoutes(deps))
  return { app, calls }
}

test('GET /factoids?track_id returns the cached factoids for that track', async () => {
  const { app, calls } = makeApp()
  const res = await app.request('/factoids?track_id=42')
  assert.equal(res.status, 200)
  const body = await res.json() as { factoids: { id: number, subject: string }[] }
  assert.equal(body.factoids.length, 1)
  assert.equal(body.factoids[0].subject, 'Aja')
  assert.deepEqual(calls.listForTrack[0], [42])
})

test('GET /factoids with no track_id falls back to random factoids', async () => {
  const { app, calls } = makeApp()
  const res = await app.request('/factoids')
  assert.equal(res.status, 200)
  const body = await res.json() as { factoids: { id: number }[] }
  assert.equal(body.factoids[0].id, 2)
  assert.equal(calls.randomFactoids.length, 1)
  assert.equal(calls.listForTrack.length, 0)
})

test('GET /factoids with a non-numeric track_id falls back to random rather than 500ing', async () => {
  const { app, calls } = makeApp()
  const res = await app.request('/factoids?track_id=not-a-number')
  assert.equal(res.status, 200)
  assert.equal(calls.randomFactoids.length, 1)
})

test('an empty store result is returned as an empty list, not an error', async () => {
  // The orphaned-track case itself (tracks.album_id / artist_id have no FK) is
  // pinned against the real DB in factoidStore.test.ts; this only proves the
  // route passes an empty result through as a 200 instead of treating it as a 404.
  const { app } = makeApp({ listForTrack: async () => [] as never })
  const res = await app.request('/factoids?track_id=42')
  assert.equal(res.status, 200)
  assert.deepEqual(await res.json(), { factoids: [] })
})

test('GET /factoids/random returns random factoids', async () => {
  const { app, calls } = makeApp()
  const res = await app.request('/factoids/random')
  assert.equal(res.status, 200)
  assert.equal(calls.randomFactoids.length, 1)
})

test('a store failure returns an empty list with 200 so the kiosk degrades quietly', async () => {
  const { app } = makeApp({ listForTrack: async () => { throw new Error('db down') } })
  const res = await app.request('/factoids?track_id=42')
  assert.equal(res.status, 200)
  assert.deepEqual(await res.json(), { factoids: [] })
})

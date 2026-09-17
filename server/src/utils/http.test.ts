// server/src/utils/http.test.ts
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { Hono } from 'hono'
import { parseIntParam, loadOwned, paginate } from './http.js'

test('parseIntParam', () => {
  assert.equal(parseIntParam('42'), 42)
  assert.equal(parseIntParam('0'), 0)
  for (const bad of [undefined, '', 'abc', '4.2', '-1', '12abc']) assert.equal(parseIntParam(bad), null)
})

const ownedApp = (user: unknown, row: unknown) => {
  const app = new Hono()
  app.use('*', async (c, next) => { if (user) c.set('user' as never, user as never); await next() })
  app.put('/collection/:id', loadOwned('collections', 'id', async () => row as any), (c) => c.json({ owned: (c.get as any)('owned') }))
  return app
}

test('loadOwned: 400, 404, 403, then passes the row through', async () => {
  const row = { id: 3, user_id: 7 }
  assert.equal((await ownedApp({ id: 7, admin: false }, row).request('/collection/abc', { method: 'PUT' })).status, 400)
  assert.equal((await ownedApp({ id: 7, admin: false }, undefined).request('/collection/3', { method: 'PUT' })).status, 404)
  assert.equal((await ownedApp({ id: 8, admin: false }, row).request('/collection/3', { method: 'PUT' })).status, 403)
  const ok = await ownedApp({ id: 8, admin: true }, row).request('/collection/3', { method: 'PUT' })
  assert.equal(ok.status, 200)
  assert.deepEqual(await ok.json(), { owned: row })
})

test('paginate clamps page/limit and computes totals', async () => {
  const app = new Hono()
  const seen: number[][] = []
  app.get('/x', async (c) => c.json(await paginate(c, {
    count: async () => 51,
    listPage: async (limit, offset) => { seen.push([limit, offset]); return ['row'] },
  })))
  const res = await (await app.request('/x?page=3&limit=25')).json()
  assert.deepEqual(res, { items: ['row'], pagination: { page: 3, limit: 25, total: 51, totalPages: 3 } })
  await app.request('/x?page=0&limit=abc')
  assert.deepEqual(seen, [[25, 50], [1, 0]])
})

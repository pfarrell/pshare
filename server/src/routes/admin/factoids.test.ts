// server/src/routes/admin/factoids.test.ts
// The router is tested without requireAdmin: that middleware is applied once,
// at the mount point in src/index.ts, and is not this router's concern.
import { test, after, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import { Hono } from 'hono'
import { db } from '../../db/database.js'
import { createArtist, createAlbum, cleanupFixtures } from '../../test/fixtures.js'
import { claimEntity, recordResult } from '../../services/factoidLedger.js'
import { insertFactoids } from '../../services/factoidStore.js'
import factoidsAdmin from './factoids.js'

const app = new Hono()
app.route('/admin', factoidsAdmin)

beforeEach(async () => { await cleanupFixtures() })
after(async () => { await cleanupFixtures(); await db.destroy() })

const seed = async (label: string) => {
  const artist = await createArtist(`${label}-artist`)
  const album = await createAlbum(`${label}-album`, artist.id)
  const generationId = (await claimEntity('album', album.id))!
  await recordResult(generationId, 'ok', 1)
  await insertFactoids(
    [{ kind: 'album', targetId: album.id, text: `${label} fact.`, sourceUrl: 'https://example.com/a', sourceTitle: 'Src' }],
    'm', generationId,
  )
  return { artist, album, generationId }
}

test('GET /admin/factoids lists an entity\'s factoids and its generation status', async () => {
  const { album } = await seed('adm-list')
  const res = await app.request(`/admin/factoids?kind=album&target_id=${album.id}`)
  assert.equal(res.status, 200)
  const body = await res.json() as { factoids: { text: string }[], generation: { status: string } | null }
  assert.equal(body.factoids.length, 1)
  assert.equal(body.generation?.status, 'ok')
})

test('GET /admin/factoids with no generation row returns generation null', async () => {
  const artist = await createArtist('adm-nogen')
  const res = await app.request(`/admin/factoids?kind=artist&target_id=${artist.id}`)
  assert.equal(res.status, 200)
  const body = await res.json() as { factoids: unknown[], generation: unknown }
  assert.deepEqual(body.factoids, [])
  assert.equal(body.generation, null)
})

test('GET /admin/factoids rejects a bad kind and a missing target_id', async () => {
  assert.equal((await app.request('/admin/factoids?kind=label&target_id=1')).status, 400)
  assert.equal((await app.request('/admin/factoids?kind=album')).status, 400)
  assert.equal((await app.request('/admin/factoids?kind=album&target_id=abc')).status, 400)
})

test('DELETE /admin/factoids/:id removes it, then 404s on a second delete', async () => {
  const { album } = await seed('adm-del')
  const [row] = await db.selectFrom('factoids').select('id').where('kind', '=', 'album').where('target_id', '=', album.id).execute()

  assert.equal((await app.request(`/admin/factoids/${row.id}`, { method: 'DELETE' })).status, 200)
  assert.equal((await app.request(`/admin/factoids/${row.id}`, { method: 'DELETE' })).status, 404)
})

test('DELETE /admin/factoids/:id rejects a non-numeric id', async () => {
  assert.equal((await app.request('/admin/factoids/abc', { method: 'DELETE' })).status, 400)
})

test('DELETE /admin/factoids/generations/:kind/:id clears the ledger row so the entity can be researched again', async () => {
  const { album } = await seed('adm-regen')
  assert.equal(await claimEntity('album', album.id), null, 'an ok entity is not re-claimable')

  const res = await app.request(`/admin/factoids/generations/album/${album.id}`, { method: 'DELETE' })
  assert.equal(res.status, 200)

  assert.ok(await claimEntity('album', album.id), 'once cleared, the worker can claim it again')
})

test('clearing a generation leaves the published factoids in place', async () => {
  const { album } = await seed('adm-keep')
  await app.request(`/admin/factoids/generations/album/${album.id}`, { method: 'DELETE' })
  const remaining = await db.selectFrom('factoids').select('id').where('kind', '=', 'album').where('target_id', '=', album.id).execute()
  assert.equal(remaining.length, 1)
})

test('DELETE generations rejects kind="track" and a non-numeric id', async () => {
  assert.equal((await app.request('/admin/factoids/generations/track/1', { method: 'DELETE' })).status, 400)
  assert.equal((await app.request('/admin/factoids/generations/album/abc', { method: 'DELETE' })).status, 400)
})

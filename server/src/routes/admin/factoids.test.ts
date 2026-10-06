// server/src/routes/admin/factoids.test.ts
// The router is tested without requireAdmin: that middleware is applied once,
// at the mount point in src/index.ts, and is not this router's concern.
import { test, after, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import { Hono } from 'hono'
import { sql } from 'kysely'
import { db } from '../../db/database.js'
import { createArtist, createAlbum, createTrack, cleanupFixtures, fixtureName } from '../../test/fixtures.js'
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

// ---- GET /admin/factoids/all: the global review list --------------------------
// The dev DB holds other factoids, so each test finds its own rows by searching
// for a string unique to the run (which also exercises the q filter itself).

type AdminRow = {
  id: number, kind: string, text: string, subject: string | null, by: string | null,
  model: string, source_url: string, link: { kind: string, id: number } | null,
}
type AllBody = { factoids: AdminRow[], pagination: { page: number, limit: number, total: number, totalPages: number } }
const getAll = async (query: string) => {
  const res = await app.request(`/admin/factoids/all?${query}`)
  assert.equal(res.status, 200)
  return await res.json() as AllBody
}

test('GET /admin/factoids/all lists across kinds, newest first, with subject, byline and link', async () => {
  const tag = fixtureName('all-mix')
  const artist = await createArtist('all-mix-artist')
  const album = await createAlbum('all-mix-album', artist.id)
  const track = await createTrack('all-mix-track', album.id, artist.id)
  const generationId = (await claimEntity('album', album.id))!
  await insertFactoids([
    { kind: 'artist', targetId: artist.id, text: `${tag} about the artist`, sourceUrl: 'https://example.com/a', sourceTitle: null },
    { kind: 'album', targetId: album.id, text: `${tag} about the album`, sourceUrl: 'https://example.com/b', sourceTitle: 'B' },
    { kind: 'track', targetId: track.id, text: `${tag} about the track`, sourceUrl: 'https://example.com/c', sourceTitle: 'C' },
  ], 'test-model', generationId)
  // One INSERT statement gives every row the same created_at; space them out.
  for (const [suffix, when] of [['artist', '2026-01-01'], ['album', '2026-01-03'], ['track', '2026-01-02']] as const) {
    await sql`UPDATE factoids SET created_at = ${new Date(when)} WHERE text = ${`${tag} about the ${suffix}`}`.execute(db)
  }

  const body = await getAll(`q=${encodeURIComponent(tag)}`)

  assert.deepEqual(body.factoids.map((f) => f.kind), ['album', 'track', 'artist'], 'newest first')
  assert.equal(body.pagination.total, 3)
  const [alb, trk, art] = body.factoids
  assert.equal(art.subject, artist.name)
  assert.deepEqual(art.link, { kind: 'artist', id: artist.id })
  assert.equal(alb.subject, album.title)
  assert.equal(alb.by, artist.name)
  assert.deepEqual(alb.link, { kind: 'album', id: album.id })
  assert.equal(trk.subject, track.title)
  assert.equal(trk.by, artist.name)
  assert.deepEqual(trk.link, { kind: 'album', id: album.id }, 'a track links to its album page')
  assert.equal(alb.model, 'test-model')
})

test('GET /admin/factoids/all filters by kind', async () => {
  const tag = fixtureName('all-kind')
  const artist = await createArtist('all-kind-artist')
  const album = await createAlbum('all-kind-album', artist.id)
  const generationId = (await claimEntity('album', album.id))!
  await insertFactoids([
    { kind: 'artist', targetId: artist.id, text: `${tag} a`, sourceUrl: 'https://example.com/a', sourceTitle: null },
    { kind: 'album', targetId: album.id, text: `${tag} b`, sourceUrl: 'https://example.com/b', sourceTitle: null },
  ], 'm', generationId)

  const body = await getAll(`q=${encodeURIComponent(tag)}&kind=artist`)
  assert.deepEqual(body.factoids.map((f) => f.kind), ['artist'])
  assert.equal(body.pagination.total, 1)
})

test('GET /admin/factoids/all treats % and _ in the search as literal characters', async () => {
  const tag = fixtureName('all-like')
  const artist = await createArtist('all-like-artist')
  const generationId = (await claimEntity('artist', artist.id))!
  await insertFactoids([
    { kind: 'artist', targetId: artist.id, text: `${tag} sold 100% of them`, sourceUrl: 'https://example.com/a', sourceTitle: null },
    { kind: 'artist', targetId: artist.id, text: `${tag} sold 100 of them`, sourceUrl: 'https://example.com/b', sourceTitle: null },
    { kind: 'artist', targetId: artist.id, text: `${tag} snake_case`, sourceUrl: 'https://example.com/c', sourceTitle: null },
    { kind: 'artist', targetId: artist.id, text: `${tag} snakeXcase`, sourceUrl: 'https://example.com/d', sourceTitle: null },
  ], 'm', generationId)

  // Unescaped, "100% of" would be "100" + anything + " of" and match both sold-100 rows.
  const pct = await getAll(`q=${encodeURIComponent(`${tag} sold 100% of`)}`)
  assert.deepEqual(pct.factoids.map((f) => f.text), [`${tag} sold 100% of them`], '% must be literal')

  // Unescaped, "snake_case" would also match "snakeXcase".
  const underscore = await getAll(`q=${encodeURIComponent(`${tag} snake_case`)}`)
  assert.deepEqual(underscore.factoids.map((f) => f.text), [`${tag} snake_case`], '_ must be literal')
})

test('GET /admin/factoids/all paginates', async () => {
  const tag = fixtureName('all-page')
  const artist = await createArtist('all-page-artist')
  const generationId = (await claimEntity('artist', artist.id))!
  await insertFactoids(
    [1, 2, 3].map((n) => ({ kind: 'artist' as const, targetId: artist.id, text: `${tag} fact ${n}`, sourceUrl: 'https://example.com/a', sourceTitle: null })),
    'm', generationId,
  )

  const first = await getAll(`q=${encodeURIComponent(tag)}&limit=2&page=1`)
  const second = await getAll(`q=${encodeURIComponent(tag)}&limit=2&page=2`)
  assert.equal(first.factoids.length, 2)
  assert.equal(second.factoids.length, 1)
  assert.deepEqual(first.pagination, { page: 1, limit: 2, total: 3, totalPages: 2 })
  assert.equal(new Set([...first.factoids, ...second.factoids].map((f) => f.id)).size, 3, 'no row repeats across pages')
})

test('GET /admin/factoids/all still returns a track whose album row is gone', async () => {
  const tag = fixtureName('all-dangle')
  const artist = await createArtist('all-dangle-artist')
  const album = await createAlbum('all-dangle-album', artist.id)
  const track = await createTrack('all-dangle-track', album.id, artist.id)
  const generationId = (await claimEntity('album', album.id))!
  await insertFactoids(
    [{ kind: 'track', targetId: track.id, text: `${tag} orphaned`, sourceUrl: 'https://example.com/a', sourceTitle: null }],
    'm', generationId,
  )
  await db.deleteFrom('albums').where('id', '=', album.id).execute() // tracks.album_id has no FK

  const body = await getAll(`q=${encodeURIComponent(tag)}`)
  assert.equal(body.factoids.length, 1)
  assert.equal(body.factoids[0].subject, track.title)
  assert.equal(body.factoids[0].link, null, 'no album page to link to')
  // cleanupFixtures finds ledger rows through their entities, and the album is
  // gone: without this the claim stays "pending" in the shared DB forever and
  // later trips factoidLedger's global reapStalePending test.
  await db.deleteFrom('factoid_generations').where('id', '=', generationId).execute()
})

test('GET /admin/factoids/all still returns a factoid whose subject was deleted', async () => {
  const tag = fixtureName('all-gone')
  const artist = await createArtist('all-gone-artist')
  const generationId = (await claimEntity('artist', artist.id))!
  await insertFactoids(
    [{ kind: 'artist', targetId: artist.id, text: `${tag} stranded`, sourceUrl: 'https://example.com/a', sourceTitle: null }],
    'm', generationId,
  )
  await db.deleteFrom('artists').where('id', '=', artist.id).execute()

  const body = await getAll(`q=${encodeURIComponent(tag)}`)
  assert.equal(body.factoids.length, 1, 'a stranded factoid is exactly what an admin needs to see and delete')
  assert.equal(body.factoids[0].subject, null)
  assert.equal(body.factoids[0].link, null)
  // cleanupFixtures keys on the (now gone) artist, so remove both rows by hand.
  // A leftover "pending" ledger row would later trip factoidLedger's global
  // reapStalePending test.
  await db.deleteFrom('factoids').where('text', 'like', `${tag}%`).execute()
  await db.deleteFrom('factoid_generations').where('id', '=', generationId).execute()
})

// ---- PATCH /admin/factoids/:id: edit the text -------------------------------

const patch = (id: number | string, body: unknown) =>
  app.request(`/admin/factoids/${id}`, {
    method: 'PATCH',
    headers: { 'content-type': 'application/json' },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  })

const rowFor = async (albumId: number) =>
  db.selectFrom('factoids').selectAll().where('kind', '=', 'album').where('target_id', '=', albumId).executeTakeFirstOrThrow()

test('PATCH /admin/factoids/:id replaces the text and leaves source, kind, target and model alone', async () => {
  const { album } = await seed('adm-edit')
  const before = await rowFor(album.id)

  const res = await patch(before.id, { text: 'Axis was recorded in a single night, with the band reading the sleeve notes.' })

  assert.equal(res.status, 200)
  assert.deepEqual(await res.json(), { factoid: { id: before.id, text: 'Axis was recorded in a single night, with the band reading the sleeve notes.' } })
  const after = await rowFor(album.id)
  assert.equal(after.text, 'Axis was recorded in a single night, with the band reading the sleeve notes.')
  for (const col of ['kind', 'target_id', 'source_url', 'source_title', 'model', 'generation_id', 'created_at'] as const) {
    assert.deepEqual(after[col], before[col], `${col} must not change`)
  }
})

test('PATCH /admin/factoids/:id trims, collapses whitespace, and replaces em-dashes like generated facts', async () => {
  const { album } = await seed('adm-edit-clean')
  const row = await rowFor(album.id)

  await patch(row.id, { text: '  She wrote it — on the bus  home.  ' })

  assert.equal((await rowFor(album.id)).text, 'She wrote it, on the bus home.')
})

test('PATCH /admin/factoids/:id rejects empty, over-long, and non-string text without changing the row', async () => {
  const { album } = await seed('adm-edit-bad')
  const row = await rowFor(album.id)

  assert.equal((await patch(row.id, { text: '' })).status, 400)
  assert.equal((await patch(row.id, { text: '   ' })).status, 400)
  assert.equal((await patch(row.id, { text: 'x'.repeat(241) })).status, 400)
  assert.equal((await patch(row.id, { text: 42 })).status, 400)
  assert.equal((await patch(row.id, {})).status, 400)
  assert.equal((await patch(row.id, 'not json')).status, 400)
  assert.equal((await patch(row.id, { text: 'x'.repeat(240) })).status, 200, '240 characters is the limit, inclusive')
  assert.equal((await rowFor(album.id)).text, 'x'.repeat(240))
})

test('PATCH /admin/factoids/:id 404s for a missing factoid and 400s for a bad id', async () => {
  assert.equal((await patch(2_000_000_999, { text: 'Hello.' })).status, 404)
  assert.equal((await patch('abc', { text: 'Hello.' })).status, 400)
})

test('an edited factoid shows its new text in the global list', async () => {
  const { album } = await seed('adm-edit-list')
  const row = await rowFor(album.id)
  const tag = fixtureName('adm-edit-list')
  await patch(row.id, { text: `${tag} now with the missing context.` })

  const body = await getAll(`q=${encodeURIComponent(tag)}`)
  assert.deepEqual(body.factoids.map((f) => f.text), [`${tag} now with the missing context.`])
})

test('GET /admin/factoids/all rejects a bad kind', async () => {
  assert.equal((await app.request('/admin/factoids/all?kind=label')).status, 400)
})

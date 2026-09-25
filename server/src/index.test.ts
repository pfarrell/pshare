import { test } from 'node:test'
import assert from 'node:assert/strict'
import { app } from './index.js'

// These routes must be reachable without an `auth` cookie — logged-out
// visitors following a shared link depend on it. A 404 (unknown id) is as
// much proof of "not gated" as a 200; only 401 is a failure here.
const PUBLIC_ROUTES = [
  '/artist/1',
  '/album/1',
  '/playlist/1',
  '/track/1',
  '/stream/1',
  '/tags/album/1',
  '/tags/artist/1',
]

// These routes must still reject an anonymous request. A regression here
// is a real data leak, not just a broken feature.
const GATED_ROUTES = [
  '/artists/random',
  '/albums/random',
  '/playlists',
  '/top',
  '/newborns',
  '/surprise',
  '/track/1/notes',
  '/download/1',
  '/search?q=test',
  '/collections',
  '/favorites',
  '/tags',
  '/tags/x/content',
  // Mounted on the public app in index.ts, gated only by an in-handler
  // requireAuth call in routes/profiles.ts — there's no router-level backstop,
  // so this entry is the only thing that would catch that call going missing.
  '/profiles',
]

for (const path of PUBLIC_ROUTES) {
  test(`${path} is reachable without a cookie (never 401)`, async () => {
    const res = await app.request(path)
    assert.notStrictEqual(res.status, 401, `${path} returned 401 — this route must stay public`)
  })
}

for (const path of GATED_ROUTES) {
  test(`${path} rejects a request without a cookie (401)`, async () => {
    const res = await app.request(path)
    assert.strictEqual(res.status, 401, `${path} returned ${res.status} instead of 401 — this route must stay gated`)
  })
}

// Session-only auth endpoints: anonymous calls must be rejected with 401.
const GATED_AUTH_ROUTES: Array<[string, string]> = [
  ['PUT', '/auth/default-profile'],
  ['GET', '/auth/recall/connect'],
  ['DELETE', '/auth/recall/connect'],
  ['PUT', '/auth/set-password'],
  ['PUT', '/auth/change-password'],
  ['DELETE', '/auth/google/disconnect'],
]

for (const [method, path] of GATED_AUTH_ROUTES) {
  test(`${method} ${path} rejects a request without a cookie (401)`, async () => {
    const res = await app.request(path, { method, body: method === 'GET' ? undefined : '{}', headers: { 'Content-Type': 'application/json' } })
    assert.strictEqual(res.status, 401)
  })
}

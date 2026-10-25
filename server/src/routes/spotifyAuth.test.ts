import 'dotenv/config'
import { test, after, beforeEach, afterEach } from 'node:test'
import assert from 'node:assert/strict'
import jwt from 'jsonwebtoken'
import { Hono } from 'hono'
import spotifyAuth from './spotifyAuth.js'
import { authMiddleware } from '../middleware/auth.js'
import { createUser, createJukeboxDevice, cleanupFixtures } from '../test/fixtures.js'
import { db } from '../db/database.js'
import { spotifyConnectionService } from '../services/spotifyConnectionService.js'

if (!process.env.RECALL_TOKEN_ENCRYPTION_KEY) process.env.RECALL_TOKEN_ENCRYPTION_KEY = 'ab'.repeat(32)

const realFetch = globalThis.fetch
const saved = { ...process.env }

beforeEach(() => {
  process.env.SPOTIFY_CLIENT_ID = 'cid'
  process.env.SPOTIFY_CLIENT_SECRET = 'secret'
  process.env.SPOTIFY_REDIRECT_BASE = 'http://127.0.0.1:5173/api'
  process.env.BEMUSED_PUBLIC_URL = 'http://spa.test'
})
afterEach(() => {
  globalThis.fetch = realFetch
  for (const k of ['SPOTIFY_CLIENT_ID', 'SPOTIFY_CLIENT_SECRET', 'SPOTIFY_REDIRECT_BASE', 'BEMUSED_PUBLIC_URL', 'SPOTIFY_ALLOWED_USER_IDS']) {
    if (saved[k] === undefined) delete process.env[k]
    else process.env[k] = saved[k]
  }
})
after(async () => {
  await cleanupFixtures()
})

const app = () => new Hono().use('*', authMiddleware).route('/auth/spotify', spotifyAuth)

function authCookie(user: { id: number; username: string }, deviceId?: number) {
  const token = jwt.sign(
    { id: user.id, username: user.username, admin: false, ...(deviceId != null ? { deviceId } : {}) },
    process.env.BEMUSED_JWT_SECRET || 'default-secret-change-me',
    { algorithm: 'HS256' },
  )
  return `auth=${token}`
}
const allow = (...users: { id: number }[]) => {
  process.env.SPOTIFY_ALLOWED_USER_IDS = users.map(u => u.id).join(',')
}
const connData = (over = {}) => ({
  spotifyUserId: 'sp',
  refreshToken: 'r',
  accessToken: 'a',
  expiresAt: new Date(Date.now() + 3600_000),
  scopes: 's',
  ...over,
})
const rowCount = async (col: 'user_id' | 'jukebox_device_id', id: number) =>
  (await db.selectFrom('spotify_connections').select('id').where(col, '=', id).execute()).length

test('default connection service refresh is wired once the routes module is imported', async () => {
  const user = await createUser('sp-wired')
  await spotifyConnectionService.upsert({ userId: user.id }, connData({ expiresAt: new Date(Date.now() - 1000) }))
  globalThis.fetch = (async () =>
    new Response(JSON.stringify({ access_token: 'fresh', token_type: 'Bearer', expires_in: 3600 }), {
      headers: { 'content-type': 'application/json' },
    })) as typeof fetch
  const tok = await spotifyConnectionService.getAccessToken({ userId: user.id })
  assert.equal(tok?.accessToken, 'fresh')
})

test('start: 403 for a logged-in user not on the allowlist', async () => {
  const user = await createUser('sp-start-deny')
  delete process.env.SPOTIFY_ALLOWED_USER_IDS
  const res = await app().request('/auth/spotify/start?target=user', { headers: { cookie: authCookie(user) } })
  assert.equal(res.status, 403)
})

test('start: redirects to accounts.spotify.com with the exact scopes and sets the three cookies', async () => {
  const user = await createUser('sp-start-ok')
  allow(user)
  const res = await app().request('/auth/spotify/start?target=user', { headers: { cookie: authCookie(user) } })
  assert.equal(res.status, 302)
  const loc = new URL(res.headers.get('location')!)
  assert.equal(loc.origin + loc.pathname, 'https://accounts.spotify.com/authorize')
  assert.equal(
    loc.searchParams.get('scope'),
    'streaming user-read-email user-read-private user-read-playback-state user-modify-playback-state',
  )
  assert.equal(loc.searchParams.get('redirect_uri'), 'http://127.0.0.1:5173/api/auth/spotify/callback')
  const cookies = res.headers.getSetCookie().join('\n')
  assert.match(cookies, /spotify_oauth_state=/)
  assert.match(cookies, /spotify_oauth_verifier=/)
  assert.match(cookies, /spotify_oauth_target=user/)
})

test('start target=device: 404 for a device the user does not own', async () => {
  const owner = await createUser('sp-dev-owner')
  const other = await createUser('sp-dev-other')
  const device = await createJukeboxDevice('sp-dev-owned', owner.id)
  allow(other)
  const res = await app().request(`/auth/spotify/start?target=device&deviceId=${device.id}`, {
    headers: { cookie: authCookie(other) },
  })
  assert.equal(res.status, 404)
})

function stubSpotify(product: string) {
  globalThis.fetch = (async (url: any) => {
    const u = url instanceof Request ? url.url : String(url)
    if (u.includes('/api/token')) {
      return new Response(
        JSON.stringify({ access_token: 'acc', refresh_token: 'ref', token_type: 'Bearer', expires_in: 3600 }),
        { headers: { 'content-type': 'application/json' } },
      )
    }
    if (u.includes('/v1/me')) {
      return new Response(JSON.stringify({ id: 'sp-me', product }), { headers: { 'content-type': 'application/json' } })
    }
    throw new Error(`unexpected fetch ${u}`)
  }) as typeof fetch
}
const callbackCookie = (user: { id: number; username: string }, target = 'user') =>
  `${authCookie(user)}; spotify_oauth_state=st; spotify_oauth_verifier=ver; spotify_oauth_target=${target}`

test('callback: mismatched state redirects to ?spotify=failed and stores nothing', async () => {
  const user = await createUser('sp-cb-state')
  allow(user)
  stubSpotify('premium')
  const res = await app().request('/auth/spotify/callback?code=c&state=WRONG', { headers: { cookie: callbackCookie(user) } })
  assert.equal(res.status, 302)
  assert.equal(res.headers.get('location'), 'http://spa.test/account?spotify=failed')
  assert.equal(await rowCount('user_id', user.id), 0)
})

test('callback: non-premium redirects to ?spotify=not_premium and stores nothing', async () => {
  const user = await createUser('sp-cb-free')
  allow(user)
  stubSpotify('free')
  const res = await app().request('/auth/spotify/callback?code=c&state=st', { headers: { cookie: callbackCookie(user) } })
  assert.equal(res.headers.get('location'), 'http://spa.test/account?spotify=not_premium')
  assert.equal(await rowCount('user_id', user.id), 0)
  assert.match(res.headers.getSetCookie().join('\n'), /spotify_oauth_state=;/)
})

test('callback: premium redirects to ?spotify=connected and stores a row for the target owner', async () => {
  const user = await createUser('sp-cb-ok')
  const device = await createJukeboxDevice('sp-cb-ok', user.id)
  allow(user)
  stubSpotify('premium')
  const res = await app().request('/auth/spotify/callback?code=c&state=st', {
    headers: { cookie: callbackCookie(user, `device:${device.id}`) },
  })
  assert.equal(res.headers.get('location'), 'http://spa.test/account?spotify=connected')
  assert.equal(await rowCount('jukebox_device_id', device.id), 1)
  assert.equal(await rowCount('user_id', user.id), 0)
})

test('token: device session resolves the device connection, not the user', async () => {
  const user = await createUser('sp-tok-dev')
  const device = await createJukeboxDevice('sp-tok-dev', user.id)
  allow(user)
  await spotifyConnectionService.upsert({ userId: user.id }, connData({ accessToken: 'user-token' }))
  await spotifyConnectionService.upsert({ deviceId: device.id }, connData({ accessToken: 'device-token' }))
  const res = await app().request('/auth/spotify/token', { headers: { cookie: authCookie(user, device.id) } })
  assert.equal(res.status, 200)
  const body = await res.json()
  assert.equal(body.accessToken, 'device-token')
  assert.ok(!Number.isNaN(Date.parse(body.expiresAt)))
})

test('token: 404 not_connected when no row, 401 without user, 403 when not allowed', async () => {
  const user = await createUser('sp-tok-none')
  allow(user)
  const res = await app().request('/auth/spotify/token', { headers: { cookie: authCookie(user) } })
  assert.equal(res.status, 404)
  assert.deepEqual(await res.json(), { error: 'not_connected' })
  assert.equal((await app().request('/auth/spotify/token')).status, 401)
  delete process.env.SPOTIFY_ALLOWED_USER_IDS
  assert.equal((await app().request('/auth/spotify/token', { headers: { cookie: authCookie(user) } })).status, 403)
})

test('token: a rejected refresh becomes 404 not_connected, not a 500', async () => {
  const user = await createUser('sp-tok-revoked')
  allow(user)
  await spotifyConnectionService.upsert({ userId: user.id }, connData({ expiresAt: new Date(Date.now() - 1000) }))
  globalThis.fetch = (async () =>
    new Response(JSON.stringify({ error: 'invalid_grant' }), { status: 400, headers: { 'content-type': 'application/json' } })) as typeof fetch
  const origError = console.error
  console.error = () => {}
  try {
    const res = await app().request('/auth/spotify/token', { headers: { cookie: authCookie(user) } })
    assert.equal(res.status, 404)
    assert.deepEqual(await res.json(), { error: 'not_connected' })
  } finally {
    console.error = origError
  }
})

test('status: lists only the user own devices with connected flags', async () => {
  const user = await createUser('sp-st-me')
  const other = await createUser('sp-st-other')
  const d1 = await createJukeboxDevice('sp-st-1', user.id)
  const d2 = await createJukeboxDevice('sp-st-2', user.id)
  await createJukeboxDevice('sp-st-x', other.id)
  allow(user)
  await spotifyConnectionService.upsert({ deviceId: d2.id }, connData())
  const res = await app().request('/auth/spotify/status', { headers: { cookie: authCookie(user) } })
  const body = await res.json()
  assert.equal(body.allowed, true)
  assert.equal(body.connected, false)
  assert.deepEqual(body.devices.map((d: any) => [d.id, d.connected]), [[d1.id, false], [d2.id, true]])

  const dev = await app().request('/auth/spotify/status', { headers: { cookie: authCookie(user, d2.id) } })
  assert.deepEqual(await dev.json(), { allowed: true, connected: true, devices: [] })
})

test('status: non-allowlisted users get allowed:false', async () => {
  const user = await createUser('sp-st-deny')
  delete process.env.SPOTIFY_ALLOWED_USER_IDS
  const res = await app().request('/auth/spotify/status', { headers: { cookie: authCookie(user) } })
  assert.equal(res.status, 200)
  assert.deepEqual(await res.json(), { allowed: false, connected: false, devices: [] })
})

test('delete: removes only the targeted connection', async () => {
  const user = await createUser('sp-del')
  const device = await createJukeboxDevice('sp-del', user.id)
  allow(user)
  await spotifyConnectionService.upsert({ userId: user.id }, connData())
  await spotifyConnectionService.upsert({ deviceId: device.id }, connData())
  const res = await app().request(`/auth/spotify/connection?target=device&deviceId=${device.id}`, {
    method: 'DELETE',
    headers: { cookie: authCookie(user) },
  })
  assert.equal(res.status, 204)
  assert.equal(await rowCount('jukebox_device_id', device.id), 0)
  assert.equal(await rowCount('user_id', user.id), 1)
})

test('start target=device: sets the device:<id> target cookie for an owned device', async () => {
  const user = await createUser('sp-start-dev')
  const device = await createJukeboxDevice('sp-start-dev', user.id)
  allow(user)
  const res = await app().request(`/auth/spotify/start?target=device&deviceId=${device.id}`, { headers: { cookie: authCookie(user) } })
  assert.equal(res.status, 302)
  assert.match(res.headers.getSetCookie().join('\n'), new RegExp(`spotify_oauth_target=device(:|%3A)${device.id}`))
})

test('start and delete: invalid target is 400', async () => {
  const user = await createUser('sp-bad-target')
  allow(user)
  const headers = { cookie: authCookie(user) }
  assert.equal((await app().request('/auth/spotify/start?target=bogus', { headers })).status, 400)
  assert.equal((await app().request('/auth/spotify/start', { headers })).status, 400)
  assert.equal((await app().request('/auth/spotify/connection?target=bogus', { method: 'DELETE', headers })).status, 400)
})

test('delete: 404 for a device the user does not own, and nothing is removed', async () => {
  const owner = await createUser('sp-del-owner')
  const other = await createUser('sp-del-other')
  const device = await createJukeboxDevice('sp-del-foreign', owner.id)
  allow(other)
  await spotifyConnectionService.upsert({ deviceId: device.id }, connData())
  const res = await app().request(`/auth/spotify/connection?target=device&deviceId=${device.id}`, {
    method: 'DELETE',
    headers: { cookie: authCookie(other) },
  })
  assert.equal(res.status, 404)
  assert.equal(await rowCount('jukebox_device_id', device.id), 1)
})

test('callback: device target cookie for a device the user does not own fails and stores nothing', async () => {
  const owner = await createUser('sp-cb-owner')
  const other = await createUser('sp-cb-other')
  const device = await createJukeboxDevice('sp-cb-foreign', owner.id)
  allow(other)
  stubSpotify('premium')
  const res = await app().request('/auth/spotify/callback?code=c&state=st', {
    headers: { cookie: callbackCookie(other, `device:${device.id}`) },
  })
  assert.equal(res.headers.get('location'), 'http://spa.test/account?spotify=failed')
  assert.equal(await rowCount('jukebox_device_id', device.id), 0)
  assert.equal(await rowCount('user_id', other.id), 0)
})

test('kiosk session: start, callback and delete are 403; token and status still work', async () => {
  const user = await createUser('sp-kiosk')
  const device = await createJukeboxDevice('sp-kiosk', user.id)
  allow(user)
  await spotifyConnectionService.upsert({ userId: user.id }, connData())
  await spotifyConnectionService.upsert({ deviceId: device.id }, connData({ accessToken: 'dev-tok' }))
  const kiosk = authCookie(user, device.id)
  assert.equal((await app().request('/auth/spotify/start?target=user', { headers: { cookie: kiosk } })).status, 403)
  assert.equal((await app().request(`/auth/spotify/start?target=device&deviceId=${device.id}`, { headers: { cookie: kiosk } })).status, 403)
  stubSpotify('premium')
  const cb = await app().request('/auth/spotify/callback?code=c&state=st', {
    headers: { cookie: `${kiosk}; spotify_oauth_state=st; spotify_oauth_verifier=ver; spotify_oauth_target=user` },
  })
  assert.equal(cb.headers.get('location'), 'http://spa.test/account?spotify=failed')
  for (const q of ['target=user', `target=device&deviceId=${device.id}`]) {
    const del = await app().request(`/auth/spotify/connection?${q}`, { method: 'DELETE', headers: { cookie: kiosk } })
    assert.equal(del.status, 403)
  }
  assert.equal(await rowCount('user_id', user.id), 1)
  assert.equal(await rowCount('jukebox_device_id', device.id), 1)
  const tok = await app().request('/auth/spotify/token', { headers: { cookie: kiosk } })
  assert.equal((await tok.json()).accessToken, 'dev-tok')
  assert.equal((await app().request('/auth/spotify/status', { headers: { cookie: kiosk } })).status, 200)
})

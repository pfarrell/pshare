import 'dotenv/config'
import { test, after } from 'node:test'
import assert from 'node:assert/strict'
import { Hono } from 'hono'
import jwt from 'jsonwebtoken'
import { authMiddleware, requireAuth, requireOwnJukeboxDevice } from './auth.js'
import { createUser, createJukeboxDevice, cleanupFixtures } from '../test/fixtures.js'
import { jukeboxDeviceService } from '../services/jukeboxDeviceService.js'
import { db } from '../db/database.js'
import type { Variables } from '../types.js'

after(cleanupFixtures)

const JWT_SECRET = process.env.BEMUSED_JWT_SECRET || 'default-secret-change-me'

const appWithAuth = () => {
  const app = new Hono<{ Variables: Variables }>()
  app.use('*', authMiddleware)
  app.get('/me', requireAuth, (c) => c.json({ user: c.get('user') }))
  return app
}

const cookieHeader = (token: string) => ({ headers: { cookie: `auth=${token}` } })

test('a JWT with a valid deviceId claim authenticates normally', async () => {
  const user = await createUser('mw-device-ok')
  const device = await jukeboxDeviceService.create(user.id, 'Test Device')
  const token = jwt.sign({ id: user.id, username: user.username, admin: user.admin, deviceId: device.id }, JWT_SECRET, { expiresIn: '3650d' })

  const res = await appWithAuth().request('/me', cookieHeader(token))
  assert.equal(res.status, 200)
  const body = await res.json()
  assert.equal(body.user.id, user.id)
})

test('a JWT whose deviceId no longer exists (revoked) is treated as unauthenticated', async () => {
  const user = await createUser('mw-device-revoked')
  const device = await jukeboxDeviceService.create(user.id, 'Revoked Device')
  const token = jwt.sign({ id: user.id, username: user.username, admin: user.admin, deviceId: device.id }, JWT_SECRET, { expiresIn: '3650d' })

  await db.deleteFrom('jukebox_devices').where('id', '=', device.id).execute()

  const res = await appWithAuth().request('/me', cookieHeader(token))
  assert.equal(res.status, 401)
})

test('a JWT with no deviceId claim (normal login) is unaffected by the device check', async () => {
  const user = await createUser('mw-no-device')
  const token = jwt.sign({ id: user.id, username: user.username, admin: user.admin }, JWT_SECRET, { expiresIn: '14d' })

  const res = await appWithAuth().request('/me', cookieHeader(token))
  assert.equal(res.status, 200)
})

test('authMiddleware sets jukeboxDeviceId from a device JWT', async () => {
  const user = await createUser('auth-device-ctx-user')
  const device = await createJukeboxDevice('auth-device-ctx-device', user.id)
  const token = jwt.sign({ id: user.id, username: user.username, admin: user.admin, deviceId: device.id }, JWT_SECRET, { expiresIn: '3650d' })

  const app = new Hono<{ Variables: Variables }>()
  app.use('*', authMiddleware)
  app.get('/whoami', (c) => c.json({ jukeboxDeviceId: c.get('jukeboxDeviceId') ?? null }))

  const res = await app.request('/whoami', cookieHeader(token))
  const body = await res.json()

  assert.equal(body.jukeboxDeviceId, device.id)
})

test('authMiddleware leaves jukeboxDeviceId unset for a normal (non-device) login', async () => {
  const user = await createUser('auth-device-ctx-normal-user')
  const token = jwt.sign({ id: user.id, username: user.username, admin: user.admin }, JWT_SECRET, { expiresIn: '14d' })

  const app = new Hono<{ Variables: Variables }>()
  app.use('*', authMiddleware)
  app.get('/whoami', (c) => c.json({ jukeboxDeviceId: c.get('jukeboxDeviceId') ?? null }))

  const res = await app.request('/whoami', cookieHeader(token))
  const body = await res.json()

  assert.equal(body.jukeboxDeviceId, null)
})

test('authMiddleware leaves jukeboxDeviceId unset for a revoked device (deviceId claim present but device deleted)', async () => {
  const user = await createUser('auth-device-ctx-revoked-user')
  const device = await createJukeboxDevice('auth-device-ctx-revoked-device', user.id)
  const token = jwt.sign({ id: user.id, username: user.username, admin: user.admin, deviceId: device.id }, JWT_SECRET, { expiresIn: '3650d' })

  await db.deleteFrom('jukebox_devices').where('id', '=', device.id).execute()

  const app = new Hono<{ Variables: Variables }>()
  app.use('*', authMiddleware)
  app.get('/whoami', (c) => c.json({ jukeboxDeviceId: c.get('jukeboxDeviceId') ?? null }))

  const res = await app.request('/whoami', cookieHeader(token))
  const body = await res.json()

  assert.equal(body.jukeboxDeviceId, null)
})

test('requireOwnJukeboxDevice allows a request whose device JWT matches the route :id', async () => {
  const user = await createUser('req-own-device-match')
  const device = await createJukeboxDevice('req-own-device-match-device', user.id)
  const token = jwt.sign({ id: user.id, username: user.username, admin: user.admin, deviceId: device.id }, JWT_SECRET, { expiresIn: '3650d' })

  const app = new Hono<{ Variables: Variables }>()
  app.use('*', authMiddleware)
  app.get('/devices/:id/thing', requireOwnJukeboxDevice, (c) => c.json({ ok: true }))

  const res = await app.request(`/devices/${device.id}/thing`, cookieHeader(token))
  assert.equal(res.status, 200)
})

test('requireOwnJukeboxDevice 403s when the device JWT does not match the route :id', async () => {
  const user = await createUser('req-own-device-mismatch')
  const deviceA = await createJukeboxDevice('req-own-device-mismatch-a', user.id)
  const deviceB = await createJukeboxDevice('req-own-device-mismatch-b', user.id)
  const token = jwt.sign({ id: user.id, username: user.username, admin: user.admin, deviceId: deviceA.id }, JWT_SECRET, { expiresIn: '3650d' })

  const app = new Hono<{ Variables: Variables }>()
  app.use('*', authMiddleware)
  app.get('/devices/:id/thing', requireOwnJukeboxDevice, (c) => c.json({ ok: true }))

  const res = await app.request(`/devices/${deviceB.id}/thing`, cookieHeader(token))
  assert.equal(res.status, 403)
})

test('requireOwnJukeboxDevice 403s when jukeboxDeviceId is unset entirely (normal, non-device login)', async () => {
  const user = await createUser('req-own-device-no-device')
  const device = await createJukeboxDevice('req-own-device-no-device-device', user.id)
  const token = jwt.sign({ id: user.id, username: user.username, admin: user.admin }, JWT_SECRET, { expiresIn: '14d' })

  const app = new Hono<{ Variables: Variables }>()
  app.use('*', authMiddleware)
  app.get('/devices/:id/thing', requireOwnJukeboxDevice, (c) => c.json({ ok: true }))

  const res = await app.request(`/devices/${device.id}/thing`, cookieHeader(token))
  assert.equal(res.status, 403)
})

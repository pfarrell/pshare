import 'dotenv/config'
import { test, after } from 'node:test'
import assert from 'node:assert/strict'
import { Hono } from 'hono'
import jwt from 'jsonwebtoken'
import { authMiddleware, requireAuth } from './auth.js'
import { createUser, cleanupFixtures } from '../test/fixtures.js'
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

// server/src/routes/auth.test.ts
import 'dotenv/config'
import { test, after } from 'node:test'
import assert from 'node:assert/strict'
import bcrypt from 'bcrypt'
import { Hono } from 'hono'
import auth from './auth.js'
import { authMiddleware } from '../middleware/auth.js'
import { createUser, createProfile, cleanupFixtures } from '../test/fixtures.js'
import { db } from '../db/database.js'

after(cleanupFixtures)

// authMiddleware is included so a cookie from a prior /auth/jukebox-login
// call in the same test is actually parsed into c.get('user') — the auth
// router itself doesn't apply it (that only happens globally in index.ts),
// so routes guarded by requireAuth need it here to be exercised for real.
const app = () => new Hono().use('*', authMiddleware).route('/auth', auth)

test('POST /auth/jukebox-login: wrong password is rejected', async () => {
  const passwordHash = await bcrypt.hash('correct-horse', 4)
  const user = await createUser('jukebox-login-badpw', { password: passwordHash })

  const res = await app().request('/auth/jukebox-login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: user.username, password: 'wrong', deviceName: 'Kitchen' }),
  })
  // findUserForLogin looks up by exact username, but createUser prefixes the
  // label — use the same prefixed name the fixture actually created, so this
  // reaches the bcrypt.compare mismatch branch rather than "user not found".
  assert.equal(res.status, 401)
})

test('POST /auth/jukebox-login: correct credentials create a device row and set a long-lived cookie', async () => {
  const passwordHash = await bcrypt.hash('correct-horse', 4)
  const user = await createUser('jukebox-login-ok', { password: passwordHash })

  const res = await app().request('/auth/jukebox-login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: user.username, password: 'correct-horse', deviceName: 'Kitchen' }),
  })

  assert.equal(res.status, 200)
  const body = await res.json()
  assert.equal(body.user.username, user.username)
  assert.equal(body.device.name, 'Kitchen')

  const setCookie = res.headers.get('set-cookie')
  assert.match(setCookie ?? '', /auth=/)
  // 400 days is RFC 6265bis's hard cap on Max-Age (and what Hono's
  // setCookie() enforces) — just confirm it's nowhere near the normal
  // 14-day session length.
  const maxAgeMatch = setCookie?.match(/Max-Age=(\d+)/)
  assert.ok(maxAgeMatch && Number(maxAgeMatch[1]) > 86400 * 300)

  const device = await db.selectFrom('jukebox_devices').selectAll().where('user_id', '=', user.id).executeTakeFirstOrThrow()
  assert.equal(device.name, 'Kitchen')
})

test('POST /auth/jukebox-login: missing deviceName is rejected', async () => {
  const passwordHash = await bcrypt.hash('correct-horse', 4)
  const user = await createUser('jukebox-login-nodevice', { password: passwordHash })

  const res = await app().request('/auth/jukebox-login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: user.username, password: 'correct-horse' }),
  })
  assert.equal(res.status, 400)
})

test('PUT /auth/default-profile requires the profile to exist', async () => {
  const passwordHash = await bcrypt.hash('correct-horse', 4)
  const user = await createUser('default-profile-user', { password: passwordHash })
  const login = await app().request('/auth/jukebox-login', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: user.username, password: 'correct-horse', deviceName: 'Test' }),
  })
  const cookie = login.headers.get('set-cookie')

  const res = await app().request('/auth/default-profile', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', Cookie: cookie ?? '' },
    body: JSON.stringify({ profile_id: 999999999 }),
  })
  assert.equal(res.status, 404)
})

test('PUT /auth/default-profile sets default_profile_id, null clears it', async () => {
  const profile = await createProfile('default-profile-set', [])
  const passwordHash = await bcrypt.hash('correct-horse', 4)
  const user = await createUser('default-profile-set-user', { password: passwordHash })
  const login = await app().request('/auth/jukebox-login', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: user.username, password: 'correct-horse', deviceName: 'Test' }),
  })
  const cookie = login.headers.get('set-cookie')

  const setRes = await app().request('/auth/default-profile', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', Cookie: cookie ?? '' },
    body: JSON.stringify({ profile_id: profile.id }),
  })
  assert.equal(setRes.status, 200)
  assert.equal((await setRes.json()).default_profile_id, profile.id)

  const clearRes = await app().request('/auth/default-profile', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', Cookie: cookie ?? '' },
    body: JSON.stringify({ profile_id: null }),
  })
  assert.equal((await clearRes.json()).default_profile_id, null)
})

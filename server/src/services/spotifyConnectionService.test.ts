import 'dotenv/config'
import { test, after } from 'node:test'
import assert from 'node:assert/strict'
import { sql } from 'kysely'
import { db } from '../db/database.js'
import { createUser, createJukeboxDevice, cleanupFixtures } from '../test/fixtures.js'
import { createSpotifyConnectionService } from './spotifyConnectionService.js'

if (!process.env.RECALL_TOKEN_ENCRYPTION_KEY) {
  process.env.RECALL_TOKEN_ENCRYPTION_KEY = 'ab'.repeat(32)
}

after(cleanupFixtures)

const NOW = new Date('2026-10-24T12:00:00Z')
const inSeconds = (s: number) => new Date(NOW.getTime() + s * 1000)

function data(over: Partial<{ refreshToken: string; accessToken: string; expiresAt: Date }> = {}) {
  return {
    spotifyUserId: 'sp-user',
    refreshToken: 'refresh-plain',
    accessToken: 'access-plain',
    expiresAt: inSeconds(3600),
    scopes: 'streaming',
    ...over,
  }
}

test('upsert then find returns spotifyUserId for a user owner', async () => {
  const svc = createSpotifyConnectionService(db, { now: () => NOW })
  const user = await createUser('sp-find')
  await svc.upsert({ userId: user.id }, data())
  const found = await svc.find({ userId: user.id })
  assert.equal(found?.spotifyUserId, 'sp-user')
  assert.equal(found?.expiresAt.getTime(), inSeconds(3600).getTime())
})

test('upsert twice for the same device replaces, not duplicates', async () => {
  const svc = createSpotifyConnectionService(db, { now: () => NOW })
  const user = await createUser('sp-dev')
  const device = await createJukeboxDevice('sp-dev', user.id)
  await svc.upsert({ deviceId: device.id }, data({ accessToken: 'one' }))
  await svc.upsert({ deviceId: device.id }, data({ accessToken: 'two' }))
  const rows = await db.selectFrom('spotify_connections').selectAll().where('jukebox_device_id', '=', device.id).execute()
  assert.equal(rows.length, 1)
  const tok = await svc.getAccessToken({ deviceId: device.id })
  assert.equal(tok?.accessToken, 'two')
})

test('stored tokens are encrypted', async () => {
  const svc = createSpotifyConnectionService(db, { now: () => NOW })
  const user = await createUser('sp-enc')
  await svc.upsert({ userId: user.id }, data())
  const row = await db.selectFrom('spotify_connections').selectAll().where('user_id', '=', user.id).executeTakeFirstOrThrow()
  assert.notEqual(row.refresh_token, 'refresh-plain')
  assert.notEqual(row.access_token, 'access-plain')
  assert.ok(!row.refresh_token.includes('refresh-plain'))
})

test('getAccessToken returns the stored token when expiresAt is more than 60s away', async () => {
  let calls = 0
  const svc = createSpotifyConnectionService(db, {
    now: () => NOW,
    refresh: async () => { calls++; throw new Error('should not refresh') },
  })
  const user = await createUser('sp-fresh')
  await svc.upsert({ userId: user.id }, data({ expiresAt: inSeconds(120) }))
  const tok = await svc.getAccessToken({ userId: user.id })
  assert.equal(tok?.accessToken, 'access-plain')
  assert.equal(calls, 0)
})

test('getAccessToken refreshes when expiresAt is within 60s', async () => {
  const seen: string[] = []
  const svc = createSpotifyConnectionService(db, {
    now: () => NOW,
    refresh: async (rt) => {
      seen.push(rt)
      return { accessToken: 'access-new', refreshToken: 'refresh-new', expiresAt: inSeconds(3600) }
    },
  })
  const user = await createUser('sp-refresh')
  await svc.upsert({ userId: user.id }, data({ expiresAt: inSeconds(30) }))
  const tok = await svc.getAccessToken({ userId: user.id })
  assert.deepEqual(seen, ['refresh-plain'])
  assert.equal(tok?.accessToken, 'access-new')
  assert.equal(tok?.expiresAt.getTime(), inSeconds(3600).getTime())

  // persisted: a second call needs no refresh and returns the new token
  const again = await svc.getAccessToken({ userId: user.id })
  assert.equal(again?.accessToken, 'access-new')
  assert.equal(seen.length, 1)

  // new refresh token was persisted too
  await sql`UPDATE spotify_connections SET access_token_expires_at = ${inSeconds(10)} WHERE user_id = ${user.id}`.execute(db)
  await svc.getAccessToken({ userId: user.id })
  assert.deepEqual(seen, ['refresh-plain', 'refresh-new'])
})

test('getAccessToken keeps the old refresh token when refresh returns null', async () => {
  const seen: string[] = []
  const svc = createSpotifyConnectionService(db, {
    now: () => NOW,
    refresh: async (rt) => {
      seen.push(rt)
      return { accessToken: 'access-new', refreshToken: null, expiresAt: inSeconds(10) }
    },
  })
  const user = await createUser('sp-keep')
  await svc.upsert({ userId: user.id }, data({ expiresAt: inSeconds(5) }))
  await svc.getAccessToken({ userId: user.id })
  await svc.getAccessToken({ userId: user.id }) // new token is itself within 60s
  assert.deepEqual(seen, ['refresh-plain', 'refresh-plain'])
})

test('getAccessToken returns null for an owner with no row', async () => {
  const svc = createSpotifyConnectionService(db, { now: () => NOW })
  const user = await createUser('sp-none')
  assert.equal(await svc.getAccessToken({ userId: user.id }), null)
  assert.equal(await svc.find({ userId: user.id }), null)
})

test('remove deletes only that owner\'s row', async () => {
  const svc = createSpotifyConnectionService(db, { now: () => NOW })
  const a = await createUser('sp-rm-a')
  const b = await createUser('sp-rm-b')
  await svc.upsert({ userId: a.id }, data())
  await svc.upsert({ userId: b.id }, data())
  await svc.remove({ userId: a.id })
  assert.equal(await svc.find({ userId: a.id }), null)
  assert.ok(await svc.find({ userId: b.id }))
})

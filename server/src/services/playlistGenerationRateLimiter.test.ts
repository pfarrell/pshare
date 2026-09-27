import 'dotenv/config'
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { db } from '../db/database.js'
import { checkAndRecordGeneration, MAX_GENERATIONS_PER_WINDOW } from './playlistGenerationRateLimiter.js'

async function makeUser(): Promise<number> {
  const user = await db
    .insertInto('users')
    .values({
      username: `ratelimit-fixture-${Date.now()}-${Math.random()}`,
      email: null,
      password: null,
      admin: false,
      default_profile_id: null,
    })
    .returning('id')
    .executeTakeFirstOrThrow()
  return user.id
}

async function cleanup(userId: number) {
  await db.deleteFrom('ai_playlist_generations').where('user_id', '=', userId).execute()
  await db.deleteFrom('users').where('id', '=', userId).execute()
}

async function makeJukeboxDevice(): Promise<{ userId: number; deviceId: number }> {
  const userId = await makeUser()
  const device = await db
    .insertInto('jukebox_devices')
    .values({
      user_id: userId,
      name: `ratelimit-fixture-device-${Date.now()}-${Math.random()}`,
      enqueue_token: `ratelimit-fixture-token-${Date.now()}-${Math.random()}`,
    })
    .returning('id')
    .executeTakeFirstOrThrow()
  return { userId, deviceId: device.id }
}

async function cleanupJukeboxDevice(ids: { userId: number; deviceId: number }) {
  await db.deleteFrom('ai_playlist_generations').where('jukebox_device_id', '=', ids.deviceId).execute()
  await db.deleteFrom('jukebox_devices').where('id', '=', ids.deviceId).execute()
  await db.deleteFrom('users').where('id', '=', ids.userId).execute()
}

test('allows the first request for a fresh key', async () => {
  const userId = await makeUser()
  try {
    const result = await checkAndRecordGeneration({ userId, jukeboxDeviceId: null })
    assert.equal(result.allowed, true)
  } finally {
    await cleanup(userId)
  }
})

test(`allows exactly ${MAX_GENERATIONS_PER_WINDOW} requests then rejects the next`, async () => {
  const userId = await makeUser()
  try {
    for (let i = 0; i < MAX_GENERATIONS_PER_WINDOW; i++) {
      const result = await checkAndRecordGeneration({ userId, jukeboxDeviceId: null })
      assert.equal(result.allowed, true, `request ${i + 1} should be allowed`)
    }
    const overLimit = await checkAndRecordGeneration({ userId, jukeboxDeviceId: null })
    assert.equal(overLimit.allowed, false)
  } finally {
    await cleanup(userId)
  }
})

test('scopes by jukeboxDeviceId when present, independently of userId', async () => {
  const fixture = await makeJukeboxDevice()
  try {
    for (let i = 0; i < MAX_GENERATIONS_PER_WINDOW; i++) {
      const result = await checkAndRecordGeneration({ userId: fixture.userId, jukeboxDeviceId: fixture.deviceId })
      assert.equal(result.allowed, true, `request ${i + 1} should be allowed`)
    }
    const overLimit = await checkAndRecordGeneration({ userId: fixture.userId, jukeboxDeviceId: fixture.deviceId })
    assert.equal(overLimit.allowed, false)
  } finally {
    await cleanupJukeboxDevice(fixture)
  }
})

test('a generation older than the rolling window does not count against the limit', async () => {
  const userId = await makeUser()
  try {
    const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000)
    for (let i = 0; i < MAX_GENERATIONS_PER_WINDOW; i++) {
      await db.insertInto('ai_playlist_generations').values({ user_id: userId, jukebox_device_id: null, created_at: twoHoursAgo }).execute()
    }
    const result = await checkAndRecordGeneration({ userId, jukeboxDeviceId: null })
    assert.equal(result.allowed, true)
  } finally {
    await cleanup(userId)
  }
})

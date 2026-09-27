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

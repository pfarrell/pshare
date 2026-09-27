import { db } from '../db/database.js'

const WINDOW_MS = 60 * 60 * 1000
export const MAX_GENERATIONS_PER_WINDOW = 10

export interface RateLimitKey {
  userId: number | null
  jukeboxDeviceId: number | null
}

// Scoped by device when the caller is a jukebox kiosk (a device's cookie
// carries a deviceId claim regardless of which user is logged into it), else
// by user — see docs/superpowers/specs/2026-09-27-ai-playlist-generator-design.md.
export async function checkAndRecordGeneration(key: RateLimitKey): Promise<{ allowed: boolean }> {
  const since = new Date(Date.now() - WINDOW_MS)

  let query = db
    .selectFrom('ai_playlist_generations')
    .select(db.fn.count('id').as('count'))
    .where('created_at', '>', since)

  query = key.jukeboxDeviceId != null
    ? query.where('jukebox_device_id', '=', key.jukeboxDeviceId)
    : query.where('user_id', '=', key.userId)

  const { count } = await query.executeTakeFirstOrThrow()
  if (Number(count) >= MAX_GENERATIONS_PER_WINDOW) {
    return { allowed: false }
  }

  await db
    .insertInto('ai_playlist_generations')
    .values({ user_id: key.userId, jukebox_device_id: key.jukeboxDeviceId })
    .execute()

  return { allowed: true }
}

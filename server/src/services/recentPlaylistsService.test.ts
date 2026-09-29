import 'dotenv/config'
import { test, after } from 'node:test'
import assert from 'node:assert/strict'
import { db } from '../db/database.js'
import { createPlaylist, createPlaylistLog, cleanupFixtures } from '../test/fixtures.js'
import { recentPlaylistsService } from './recentPlaylistsService.js'

after(cleanupFixtures)

const DAY = 86400000
const ago = (days: number) => new Date(Date.now() - days * DAY)

test('orders by most recent play and lists each playlist once', async () => {
  const a = await createPlaylist('recent-pl-a')
  const b = await createPlaylist('recent-pl-b')
  await createPlaylistLog(a.id, null, null, null, ago(3))
  await createPlaylistLog(b.id, null, null, null, ago(1))
  await createPlaylistLog(a.id, null, null, null, ago(2))

  const rows = await recentPlaylistsService.recentlyPlayed(200)
  const ids = rows.map((r) => r.id).filter((id) => id === a.id || id === b.id)
  assert.deepEqual(ids, [b.id, a.id])
})

test('does not include playlists that were never played or were deleted', async () => {
  const neverPlayed = await createPlaylist('recent-pl-never')
  const deleted = await createPlaylist('recent-pl-deleted')
  await createPlaylistLog(deleted.id, null, null, null, ago(1))
  await db.deleteFrom('playlists').where('id', '=', deleted.id).execute()

  const ids = (await recentPlaylistsService.recentlyPlayed(200)).map((r) => r.id)
  assert.ok(!ids.includes(neverPlayed.id))
  assert.ok(!ids.includes(deleted.id))
  await db.deleteFrom('logs').where('playlist_id', '=', deleted.id).execute()
})

test('respects the size limit', async () => {
  const p = await createPlaylist('recent-pl-limit')
  await createPlaylistLog(p.id, null, null, null, new Date())
  const rows = await recentPlaylistsService.recentlyPlayed(1)
  assert.equal(rows.length, 1)
  assert.equal(rows[0].id, p.id)
})

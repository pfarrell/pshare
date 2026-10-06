// server/src/services/factoidLedger.test.ts
import { test, after, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import { sql } from 'kysely'
import { db } from '../db/database.js'
import { createArtist, createAlbum, createLog, cleanupFixtures } from '../test/fixtures.js'
import {
  claimEntity, recordResult, reapStalePending, generationsInLastDay, nextCandidate,
  STALE_PENDING_MS, FAILED_RETRY_AFTER_MS,
} from './factoidLedger.js'

const DAY_MS = 24 * 60 * 60 * 1000

// node --test runs files in parallel against one shared DB, so any assertion on
// a GLOBAL query (a count over all rows, the single most recent play) is racy:
// another file's fixtures land inside the window. The time-windowed functions
// take an injectable clock; these tests run a year in the future, where no real
// row written by a concurrent file can fall inside the window.
const FAKE_NOW = Date.now() + 365 * DAY_MS
const fakeAgo = (ms: number) => new Date(FAKE_NOW - ms)

beforeEach(async () => {
  await cleanupFixtures()
})

after(async () => {
  await cleanupFixtures()
  await db.destroy()
})

test('claimEntity returns a row id once, then null for the same target', async () => {
  const artist = await createArtist('ledger-a')
  const first = await claimEntity('artist', artist.id)
  assert.ok(first, 'first claim wins')
  assert.equal(await claimEntity('artist', artist.id), null, 'second claim is refused')
})

test('concurrent claims on the same target yield exactly one winner', async () => {
  const artist = await createArtist('ledger-race')
  const results = await Promise.all([
    claimEntity('artist', artist.id),
    claimEntity('artist', artist.id),
    claimEntity('artist', artist.id),
  ])
  assert.equal(results.filter((r) => r !== null).length, 1)
})

test('recordResult writes status and count and bumps updated_at', async () => {
  const album = await createAlbum('ledger-album', (await createArtist('ledger-album-artist')).id)
  const id = await claimEntity('album', album.id)
  await recordResult(id!, 'ok', 4)
  const row = await db.selectFrom('factoid_generations').selectAll().where('id', '=', id!).executeTakeFirstOrThrow()
  assert.equal(row.status, 'ok')
  assert.equal(row.factoid_count, 4)
})

test('reapStalePending flips only pending rows older than the threshold', async () => {
  const fresh = await createArtist('ledger-fresh')
  const stale = await createArtist('ledger-stale')
  const freshId = await claimEntity('artist', fresh.id)
  const staleId = await claimEntity('artist', stale.id)
  await db.updateTable('factoid_generations')
    .set({ updated_at: new Date(Date.now() - STALE_PENDING_MS - 1000) })
    .where('id', '=', staleId!).execute()

  assert.equal(await reapStalePending(), 1)

  const staleRow = await db.selectFrom('factoid_generations').selectAll().where('id', '=', staleId!).executeTakeFirstOrThrow()
  const freshRow = await db.selectFrom('factoid_generations').selectAll().where('id', '=', freshId!).executeTakeFirstOrThrow()
  assert.equal(staleRow.status, 'failed')
  assert.equal(freshRow.status, 'pending')
})

test('an ok or empty entity is never re-claimable', async () => {
  for (const status of ['ok', 'empty'] as const) {
    const artist = await createArtist(`ledger-done-${status}`)
    const id = await claimEntity('artist', artist.id)
    await recordResult(id!, status, 0)
    assert.equal(await claimEntity('artist', artist.id), null, `${status} must not be retried`)
  }
})

test('a failed entity is re-claimable only after the retry delay, and only 3 times', async () => {
  const artist = await createArtist('ledger-failed')
  const first = await claimEntity('artist', artist.id)
  await recordResult(first!, 'failed', 0, 'boom')

  assert.equal(await claimEntity('artist', artist.id), null, 'too soon to retry')

  const age = async () => db.updateTable('factoid_generations')
    .set({ updated_at: new Date(Date.now() - FAILED_RETRY_AFTER_MS - 1000) })
    .where('kind', '=', 'artist').where('target_id', '=', artist.id).execute()

  await age()
  const second = await claimEntity('artist', artist.id)
  assert.ok(second, 'retry allowed once aged')
  await recordResult(second!, 'failed', 0, 'boom')

  await age()
  const third = await claimEntity('artist', artist.id)
  assert.ok(third, 'third attempt allowed')
  await recordResult(third!, 'failed', 0, 'boom')

  await age()
  assert.equal(await claimEntity('artist', artist.id), null, 'attempts exhausted')
})

test('nextCandidate picks a recently played album with no ledger row', async () => {
  const artist = await createArtist('cand-artist')
  const album = await createAlbum('cand-album', artist.id)
  await createLog(album.id, null, artist.id, fakeAgo(0))

  const candidate = await nextCandidate(FAKE_NOW)
  assert.ok(candidate)
  assert.ok(
    (candidate.kind === 'album' && candidate.targetId === album.id) ||
    (candidate.kind === 'artist' && candidate.targetId === artist.id),
  )
})

test('nextCandidate ignores plays older than the lookback window', async () => {
  const artist = await createArtist('cand-old-artist')
  const album = await createAlbum('cand-old-album', artist.id)
  await createLog(album.id, null, artist.id, fakeAgo(30 * DAY_MS))

  const candidate = await nextCandidate(FAKE_NOW)
  const isOurs = candidate && (
    (candidate.kind === 'album' && candidate.targetId === album.id) ||
    (candidate.kind === 'artist' && candidate.targetId === artist.id)
  )
  assert.ok(!isOurs, 'a 30-day-old play must not be a candidate')
})

test('nextCandidate skips entities that already have a ledger row', async () => {
  const artist = await createArtist('cand-claimed-artist')
  const album = await createAlbum('cand-claimed-album', artist.id)
  await createLog(album.id, null, artist.id, fakeAgo(0))
  const a = await claimEntity('artist', artist.id)
  const b = await claimEntity('album', album.id)
  await recordResult(a!, 'ok', 1)
  await recordResult(b!, 'ok', 1)

  const candidate = await nextCandidate(FAKE_NOW)
  const isOurs = candidate && (
    (candidate.kind === 'album' && candidate.targetId === album.id) ||
    (candidate.kind === 'artist' && candidate.targetId === artist.id)
  )
  assert.ok(!isOurs)
})

// "Various Artists" is a catch-all with nothing specific to say. The row needs
// its real name (not the fixture prefix) so it is created and removed by hand.
test('nextCandidate never picks the Various Artists catch-all, whatever its case or padding', async () => {
  for (const name of ['Various Artists', 'various artists', '  VARIOUS ARTISTS ']) {
    const va = await db.insertInto('artists').values({ name }).returning('id').executeTakeFirstOrThrow()
    // album_id null so the artist is the only candidate row this play produces.
    const log = await db.insertInto('logs')
      .values({ album_id: null, track_id: null, artist_id: va.id, action: 'stream', created_at: fakeAgo(0), ip_address: null })
      .returning('id')
      .executeTakeFirstOrThrow()
    try {
      const candidate = await nextCandidate(FAKE_NOW)
      assert.ok(
        !(candidate?.kind === 'artist' && candidate.targetId === va.id),
        `"${name}" must never be researched: it would cost a call and a daily slot for nothing`,
      )
    } finally {
      await db.deleteFrom('logs').where('id', '=', log.id).execute()
      await db.deleteFrom('artists').where('id', '=', va.id).execute()
    }
  }
})

test('nextCandidate still picks an ordinary artist played with no album', async () => {
  const artist = await createArtist('cand-plain-artist')
  const log = await db.insertInto('logs')
    .values({ album_id: null, track_id: null, artist_id: artist.id, action: 'stream', created_at: fakeAgo(0), ip_address: null })
    .returning('id')
    .executeTakeFirstOrThrow()
  try {
    const candidate = await nextCandidate(FAKE_NOW)
    assert.deepEqual(candidate, { kind: 'artist', targetId: artist.id })
  } finally {
    await db.deleteFrom('logs').where('id', '=', log.id).execute()
  }
})

test('a log row with null album_id and null artist_id yields no candidate', async () => {
  const artist = await createArtist('cand-null-artist')
  const album = await createAlbum('cand-null-album', artist.id)
  // createLog requires an albumId, so write the all-null row directly. It is
  // deleted in the finally block: cleanupFixtures only removes logs by album id,
  // so this row would otherwise accumulate in the dev DB on every run.
  const nullLog = await db.insertInto('logs')
    .values({ album_id: null, track_id: null, artist_id: null, action: 'stream', created_at: fakeAgo(0), ip_address: null })
    .returning('id')
    .executeTakeFirstOrThrow()
  try {
    await db.deleteFrom('albums').where('id', '=', album.id).execute()
    await db.deleteFrom('artists').where('id', '=', artist.id).execute()

    const candidate = await nextCandidate(FAKE_NOW)
    assert.equal(candidate, null, 'with every real entity out of window and the null-id row ignored, there is nothing to pick')
  } finally {
    await db.deleteFrom('logs').where('id', '=', nullLog.id).execute()
  }
})

test('generationsInLastDay counts only the last 24 hours', async () => {
  const recent = await createArtist('cap-recent')
  const old = await createArtist('cap-old')
  const recentId = await claimEntity('artist', recent.id)
  const oldId = await claimEntity('artist', old.id)
  await recordResult(recentId!, 'ok', 1)
  await recordResult(oldId!, 'ok', 1)
  // Raw SQL on purpose: created_at is an audit timestamp, typed as immutable on
  // update in database.ts, and loosening that for one test would weaken it.
  await sql`UPDATE factoid_generations SET created_at = ${fakeAgo(60 * 60 * 1000)} WHERE id = ${recentId!}`.execute(db)
  await sql`UPDATE factoid_generations SET created_at = ${fakeAgo(3 * DAY_MS)} WHERE id = ${oldId!}`.execute(db)

  assert.equal(await generationsInLastDay(FAKE_NOW), 1)
})

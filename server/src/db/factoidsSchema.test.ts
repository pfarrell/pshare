// server/src/db/factoidsSchema.test.ts
import { test, after } from 'node:test'
import assert from 'node:assert/strict'
import { db } from './database.js'

const claim = (kind: 'artist' | 'album', targetId: number) =>
  db.insertInto('factoid_generations')
    .values({ kind, target_id: targetId, status: 'pending' })
    .onConflict((oc) => oc.columns(['kind', 'target_id']).doNothing())
    .returning('id')
    .executeTakeFirst()

// Target ids far outside the real id space, so these rows reference nothing.
const ARTIST_TARGET = 2_000_000_001
const ALBUM_TARGET = 2_000_000_002

after(async () => {
  await db.deleteFrom('factoids').where('target_id', 'in', [ARTIST_TARGET, ALBUM_TARGET]).execute()
  await db.deleteFrom('factoid_generations').where('target_id', 'in', [ARTIST_TARGET, ALBUM_TARGET]).execute()
  await db.destroy()
})

test('the unique index lets exactly one of two concurrent claims win', async () => {
  const [first, second] = await Promise.all([
    claim('artist', ARTIST_TARGET),
    claim('artist', ARTIST_TARGET),
  ])
  const winners = [first, second].filter((r) => r !== undefined)
  assert.equal(winners.length, 1, 'exactly one claim should return a row')
})

test('the same target_id under a different kind is a separate claim', async () => {
  const row = await claim('album', ARTIST_TARGET)
  assert.ok(row, 'kind is part of the uniqueness, so this must succeed')
})

// Postgres error codes. Asserting the code, not just "it rejected", matters:
// a bare assert.rejects also passes when the table does not exist at all.
const CHECK_VIOLATION = '23514'
const NOT_NULL_VIOLATION = '23502'
const hasCode = (code: string) => (err: unknown) => (err as { code?: string }).code === code

test('an unknown status is rejected by the check constraint', async () => {
  await assert.rejects(
    db.insertInto('factoid_generations')
      .values({ kind: 'album', target_id: ALBUM_TARGET, status: 'bogus' as never })
      .execute(),
    hasCode(CHECK_VIOLATION),
  )
})

test('the ledger rejects kind="track" but factoids accepts it', async () => {
  await assert.rejects(
    db.insertInto('factoid_generations')
      .values({ kind: 'track' as never, target_id: ALBUM_TARGET, status: 'pending' })
      .execute(),
    hasCode(CHECK_VIOLATION),
  )
  const factoid = await db.insertInto('factoids')
    .values({
      kind: 'track', target_id: ALBUM_TARGET, text: 'x',
      source_url: 'https://example.com/a', model: 'test',
    })
    .returning('id').executeTakeFirst()
  assert.ok(factoid)
})

test('a factoid without a source_url is rejected', async () => {
  await assert.rejects(
    db.insertInto('factoids')
      .values({ kind: 'album', target_id: ALBUM_TARGET, text: 'x', source_url: null as never, model: 'test' })
      .execute(),
    hasCode(NOT_NULL_VIOLATION),
  )
})

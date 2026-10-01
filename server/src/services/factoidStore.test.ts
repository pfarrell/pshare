// server/src/services/factoidStore.test.ts
import { test, after, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import { db } from '../db/database.js'
import { createArtist, createAlbum, createTrack, cleanupFixtures } from '../test/fixtures.js'
import { claimEntity } from './factoidLedger.js'
import {
  insertFactoids, existingTexts, listForTrack, listForTarget, randomFactoids, deleteFactoid,
} from './factoidStore.js'
import type { AcceptedFactoid } from './factoidValidation.js'

const fact = (over: Partial<AcceptedFactoid> = {}): AcceptedFactoid => ({
  kind: 'album', targetId: 1, text: 'A fact.',
  sourceUrl: 'https://example.com/a', sourceTitle: 'Src', ...over,
})

beforeEach(async () => { await cleanupFixtures() })
after(async () => { await cleanupFixtures(); await db.destroy() })

const scaffold = async (label: string) => {
  const artist = await createArtist(`${label}-artist`)
  const album = await createAlbum(`${label}-album`, artist.id)
  const track = await createTrack(`${label}-track`, album.id, artist.id)
  const generationId = (await claimEntity('album', album.id))!
  return { artist, album, track, generationId }
}

test('insertFactoids stores rows and returns the count', async () => {
  const { album, generationId } = await scaffold('store-insert')
  const count = await insertFactoids(
    [fact({ targetId: album.id }), fact({ targetId: album.id, text: 'Another fact.' })],
    'claude-opus-5-5', generationId,
  )
  assert.equal(count, 2)
  assert.equal((await listForTarget('album', album.id)).length, 2)
})

test('insertFactoids on an empty list is a no-op returning 0', async () => {
  assert.equal(await insertFactoids([], 'claude-opus-5-5', 1), 0)
})

test('existingTexts returns stored text for dedupe', async () => {
  const { album, generationId } = await scaffold('store-existing')
  await insertFactoids([fact({ targetId: album.id, text: 'Stored already.' })], 'm', generationId)
  assert.deepEqual(await existingTexts('album', album.id), ['Stored already.'])
})

test('listForTrack returns track, album, and artist factoids with subject labels', async () => {
  const { artist, album, track, generationId } = await scaffold('store-track')
  await insertFactoids([
    fact({ kind: 'track', targetId: track.id, text: 'Track fact.' }),
    fact({ kind: 'album', targetId: album.id, text: 'Album fact.' }),
    fact({ kind: 'artist', targetId: artist.id, text: 'Artist fact.' }),
  ], 'm', generationId)

  const rows = await listForTrack(track.id)
  assert.equal(rows.length, 3)
  const byKind = Object.fromEntries(rows.map((r) => [r.kind, r]))
  assert.equal(byKind.track.subject, track.title)
  assert.equal(byKind.album.subject, album.title)
  assert.equal(byKind.artist.subject, artist.name)
})

test('listForTrack respects its limit', async () => {
  const { album, track, generationId } = await scaffold('store-limit')
  await insertFactoids(
    Array.from({ length: 5 }, (_, i) => fact({ targetId: album.id, text: `Fact ${i}.` })),
    'm', generationId,
  )
  assert.equal((await listForTrack(track.id, 2)).length, 2)
})

test('listForTrack on an unknown track id returns an empty list, not an error', async () => {
  assert.deepEqual(await listForTrack(2_000_000_123), [])
})

test('listForTrack still returns the track factoid when the album row was deleted', async () => {
  // tracks.album_id has no FK, so an orphaned track is a real state in this DB.
  const { album, track, generationId } = await scaffold('store-orphan-album')
  await insertFactoids([fact({ kind: 'track', targetId: track.id, text: 'Survivor track fact.' })], 'm', generationId)
  await db.deleteFrom('albums').where('id', '=', album.id).execute()

  const rows = await listForTrack(track.id)
  assert.equal(rows.length, 1)
  assert.equal(rows[0].subject, track.title)
})

test('listForTrack works for a track with no artist of its own', async () => {
  const artist = await createArtist('store-noartist-artist')
  const album = await createAlbum('store-noartist-album', artist.id)
  const track = await createTrack('store-noartist-track', album.id, null)
  const generationId = (await claimEntity('album', album.id))!
  await insertFactoids([
    fact({ kind: 'album', targetId: album.id, text: 'Album fact on a null-artist track.' }),
    fact({ kind: 'artist', targetId: artist.id, text: 'Artist fact via the album artist.' }),
  ], 'm', generationId)

  const rows = await listForTrack(track.id)
  const byKind = Object.fromEntries(rows.map((r) => [r.kind, r]))
  assert.equal(byKind.album.subject, album.title)
  assert.equal(byKind.artist.subject, artist.name, 'artist falls back to the album artist')
})

test('randomFactoids returns display rows with subjects', async () => {
  const { album, generationId } = await scaffold('store-random')
  await insertFactoids([fact({ targetId: album.id, text: 'Random-able fact.' })], 'm', generationId)
  const rows = await randomFactoids(10)
  const mine = rows.find((r) => r.text === 'Random-able fact.')
  assert.ok(mine)
  assert.equal(mine.subject, album.title)
})

test('deleteFactoid removes the row and reports whether it existed', async () => {
  const { album, generationId } = await scaffold('store-delete')
  await insertFactoids([fact({ targetId: album.id })], 'm', generationId)
  const [row] = await listForTarget('album', album.id)
  assert.equal(await deleteFactoid(row.id), true)
  assert.equal((await listForTarget('album', album.id)).length, 0)
  assert.equal(await deleteFactoid(row.id), false)
})

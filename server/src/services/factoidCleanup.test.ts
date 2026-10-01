// server/src/services/factoidCleanup.test.ts
// factoids.target_id is polymorphic (kind + target_id) so PostgreSQL cannot
// enforce a foreign key: every delete and merge path must clean up explicitly,
// and nothing but these tests will notice a path that was missed.
import { test, after, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import { Hono } from 'hono'
import { db } from '../db/database.js'
import { createArtist, createAlbum, createTrack, cleanupFixtures } from '../test/fixtures.js'
import { deleteAlbumsCascade, deleteFactoidsFor, reassignFactoids } from './entityDeleteService.js'
import { mergeArtistInto } from './artistMergeService.js'
import { mergeAlbumInto } from './albumMergeService.js'
import { mergeTrackInto } from './trackMergeService.js'
import adminArtists from '../routes/admin/artists.js'
import adminAlbums from '../routes/admin/albums.js'
import adminTracks from '../routes/admin/tracks.js'

const addFactoid = (kind: 'artist' | 'album' | 'track', targetId: number, text = `fact for ${kind} ${targetId}`) =>
  db.insertInto('factoids')
    .values({ kind, target_id: targetId, text, source_url: 'https://example.com/a', model: 'test' })
    .execute()

const countFactoids = async (kind: 'artist' | 'album' | 'track', targetId: number) =>
  (await db.selectFrom('factoids').select('id').where('kind', '=', kind).where('target_id', '=', targetId).execute()).length

const countLedger = async (kind: 'artist' | 'album', targetId: number) =>
  (await db.selectFrom('factoid_generations').select('id').where('kind', '=', kind).where('target_id', '=', targetId).execute()).length

const addLedger = (kind: 'artist' | 'album', targetId: number) =>
  db.insertInto('factoid_generations').values({ kind, target_id: targetId, status: 'ok' }).execute()

const app = new Hono()
app.route('/admin', adminArtists)
app.route('/admin', adminAlbums)
app.route('/admin', adminTracks)

beforeEach(async () => { await cleanupFixtures() })
after(async () => { await cleanupFixtures(); await db.destroy() })

test('deleteAlbumsCascade removes the album and track factoids and the ledger row', async () => {
  const artist = await createArtist('clean-artist')
  const album = await createAlbum('clean-album', artist.id)
  const track = await createTrack('clean-track', album.id, artist.id)
  await addFactoid('album', album.id)
  await addFactoid('track', track.id)
  await addLedger('album', album.id)

  await db.transaction().execute((trx) => deleteAlbumsCascade([album.id], trx))

  assert.equal(await countFactoids('album', album.id), 0)
  assert.equal(await countFactoids('track', track.id), 0, 'track factoids must not orphan')
  assert.equal(await countLedger('album', album.id), 0)
})

test('deleteFactoidsFor is a no-op on an empty id list', async () => {
  await db.transaction().execute(async (trx) => {
    await deleteFactoidsFor('artist', [], trx)
  })
})

test('reassignFactoids moves rows from the loser to the target', async () => {
  const winner = await createArtist('reassign-winner')
  const loser = await createArtist('reassign-loser')
  await addFactoid('artist', loser.id)

  await db.transaction().execute((trx) => reassignFactoids('artist', loser.id, winner.id, trx))

  assert.equal(await countFactoids('artist', loser.id), 0)
  assert.equal(await countFactoids('artist', winner.id), 1)
})

test('reassignFactoids drops loser factoids whose text the target already has', async () => {
  // A merge exists precisely because two records were duplicates, so both were
  // likely researched and independently found the same fact. Redirecting blindly
  // would show it twice on the kiosk; the same dedupe-then-redirect shape the
  // other merge steps use.
  const winner = await createArtist('dup-winner')
  const loser = await createArtist('dup-loser')
  await addFactoid('artist', winner.id, 'The horn solo was cut in one take.')
  await addFactoid('artist', loser.id, '  the HORN solo was cut in one take.  ')
  await addFactoid('artist', loser.id, 'A different fact entirely.')

  await db.transaction().execute((trx) => reassignFactoids('artist', loser.id, winner.id, trx))

  const texts = (await db.selectFrom('factoids').select('text').where('kind', '=', 'artist').where('target_id', '=', winner.id).execute())
    .map((r) => r.text.trim().toLowerCase()).sort()
  assert.deepEqual(texts, ['a different fact entirely.', 'the horn solo was cut in one take.'])
})

test('reassignFactoids also moves the ledger row when the target has none', async () => {
  const winner = await createArtist('ledger-winner')
  const loser = await createArtist('ledger-loser')
  await addLedger('artist', loser.id)

  await db.transaction().execute((trx) => reassignFactoids('artist', loser.id, winner.id, trx))

  assert.equal(await countLedger('artist', winner.id), 1)
  assert.equal(await countLedger('artist', loser.id), 0)
})

test('reassignFactoids drops the loser ledger row when the target already has one', async () => {
  // The unique index on (kind, target_id) means a blind update would otherwise
  // violate it and abort the whole merge transaction.
  const winner = await createArtist('both-winner')
  const loser = await createArtist('both-loser')
  await addLedger('artist', winner.id)
  await addLedger('artist', loser.id)

  await db.transaction().execute((trx) => reassignFactoids('artist', loser.id, winner.id, trx))

  assert.equal((await countLedger('artist', winner.id)) + (await countLedger('artist', loser.id)), 1, 'exactly one ledger row survives')
})

test('mergeArtistInto carries factoids and the ledger row to the surviving artist', async () => {
  const winner = await createArtist('merge-a-winner')
  const loser = await createArtist('merge-a-loser')
  await addFactoid('artist', loser.id)
  await addLedger('artist', loser.id)

  await db.transaction().execute((trx) => mergeArtistInto(winner.id, loser.id, trx))

  assert.equal(await countFactoids('artist', winner.id), 1)
  assert.equal(await countFactoids('artist', loser.id), 0)
  assert.equal(await countLedger('artist', winner.id), 1)
})

test('mergeAlbumInto carries album factoids over and leaves moved tracks\' factoids attached', async () => {
  const artist = await createArtist('merge-b-artist')
  const target = await createAlbum('merge-b-target', artist.id)
  const loser = await createAlbum('merge-b-loser', artist.id)
  const loserTrack = await createTrack('merge-b-track', loser.id, artist.id)
  await addFactoid('album', loser.id)
  await addFactoid('track', loserTrack.id)

  await db.transaction().execute((trx) => mergeAlbumInto(target.id, loser.id, trx))

  assert.equal(await countFactoids('album', target.id), 1)
  assert.equal(await countFactoids('album', loser.id), 0)
  // Track ids survive an album merge (the rows are re-parented, not copied).
  assert.equal(await countFactoids('track', loserTrack.id), 1)
})

test('mergeTrackInto carries track factoids to the surviving track', async () => {
  const artist = await createArtist('merge-c-artist')
  const album = await createAlbum('merge-c-album', artist.id)
  const target = await createTrack('merge-c-target', album.id, artist.id)
  const loser = await createTrack('merge-c-loser', album.id, artist.id)
  await addFactoid('track', loser.id)

  await db.transaction().execute((trx) => mergeTrackInto(target.id, loser.id, trx))

  assert.equal(await countFactoids('track', target.id), 1)
  assert.equal(await countFactoids('track', loser.id), 0)
})

test('DELETE /admin/track/:id removes that track\'s factoids', async () => {
  // The single-track delete route is not covered by deleteAlbumsCascade.
  const artist = await createArtist('route-t-artist')
  const album = await createAlbum('route-t-album', artist.id)
  const track = await createTrack('route-t-track', album.id, artist.id)
  await addFactoid('track', track.id)

  const res = await app.request(`/admin/track/${track.id}`, { method: 'DELETE' })

  assert.equal(res.status, 200)
  assert.equal(await countFactoids('track', track.id), 0, 'a deleted track must not leave factoids behind')
})

test('DELETE /admin/album/:id removes album, track, and ledger rows', async () => {
  const artist = await createArtist('route-al-artist')
  const album = await createAlbum('route-al-album', artist.id)
  const track = await createTrack('route-al-track', album.id, artist.id)
  await addFactoid('album', album.id)
  await addFactoid('track', track.id)
  await addLedger('album', album.id)

  const res = await app.request(`/admin/album/${album.id}`, { method: 'DELETE' })

  assert.equal(res.status, 200)
  assert.equal(await countFactoids('album', album.id), 0)
  assert.equal(await countFactoids('track', track.id), 0)
  assert.equal(await countLedger('album', album.id), 0)
})

test('DELETE /admin/artist/:id removes artist, album, and track factoids and both ledger rows', async () => {
  const artist = await createArtist('route-ar-artist')
  const album = await createAlbum('route-ar-album', artist.id)
  const track = await createTrack('route-ar-track', album.id, artist.id)
  await addFactoid('artist', artist.id)
  await addFactoid('album', album.id)
  await addFactoid('track', track.id)
  await addLedger('artist', artist.id)
  await addLedger('album', album.id)

  const res = await app.request(`/admin/artist/${artist.id}`, { method: 'DELETE' })

  assert.equal(res.status, 200)
  assert.equal(await countFactoids('artist', artist.id), 0)
  assert.equal(await countFactoids('album', album.id), 0)
  assert.equal(await countFactoids('track', track.id), 0)
  assert.equal(await countLedger('artist', artist.id), 0)
  assert.equal(await countLedger('album', album.id), 0)
})

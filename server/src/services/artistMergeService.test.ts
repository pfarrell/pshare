// server/src/services/artistMergeService.test.ts
import 'dotenv/config'
import { test, after } from 'node:test'
import assert from 'node:assert/strict'
import { db } from '../db/database.js'
import { createArtist, createAlbum, createTrack, cleanupFixtures } from '../test/fixtures.js'
import { mergeArtistInto } from './artistMergeService.js'

after(cleanupFixtures)

const relation = (artist_id: number, related_artist_id: number, kind = 'related') =>
  db.insertInto('artist_relations')
    .values({ artist_id, related_artist_id, kind, source: 'manual', similarity: null, is_hidden: false, force_show: false })
    .execute()

test('merge moves albums, tracks, credits, and relations to the target and deletes the loser', async () => {
  const target = await createArtist('merge-target')
  const loser = await createArtist('merge-loser')
  const x = await createArtist('merge-x')
  const y = await createArtist('merge-y')

  const loserAlbum = await createAlbum('merge-loser-album', loser.id)
  const loserTrack = await createTrack('merge-loser-track', loserAlbum.id, loser.id)
  const targetAlbum = await createAlbum('merge-target-album', target.id)
  const guestTrack = await createTrack('merge-guest-track', targetAlbum.id, loser.id)
  const otherAlbum = await createAlbum('merge-other-album', x.id)

  await db.insertInto('artist_albums').values([
    { artist_id: loser.id, album_id: targetAlbum.id, role: 'featured', order: 1 },
    { artist_id: loser.id, album_id: otherAlbum.id, role: 'guest', order: 1 },
  ]).execute()

  await relation(x.id, loser.id)
  await relation(x.id, target.id)
  await relation(y.id, loser.id)
  await relation(loser.id, target.id)

  await db.transaction().execute((trx) => mergeArtistInto(target.id, loser.id, trx))

  assert.equal(await db.selectFrom('artists').select('id').where('id', '=', loser.id).executeTakeFirst(), undefined)
  const album = await db.selectFrom('albums').select('artist_id').where('id', '=', loserAlbum.id).executeTakeFirstOrThrow()
  assert.equal(album.artist_id, target.id)
  for (const trackId of [loserTrack.id, guestTrack.id]) {
    const t = await db.selectFrom('tracks').select('artist_id').where('id', '=', trackId).executeTakeFirstOrThrow()
    assert.equal(t.artist_id, target.id)
  }

  const credits = await db.selectFrom('artist_albums').select(['album_id']).where('artist_id', '=', target.id).orderBy('album_id').execute()
  assert.deepEqual(credits.map((r) => r.album_id), [targetAlbum.id, otherAlbum.id].sort((a, b) => a - b))

  const rels = await db.selectFrom('artist_relations').select(['artist_id', 'related_artist_id'])
    .where((eb) => eb.or([eb('artist_id', 'in', [target.id, loser.id, x.id, y.id]), eb('related_artist_id', 'in', [target.id, loser.id])]))
    .execute()
  assert.ok(rels.every((r) => r.artist_id !== loser.id && r.related_artist_id !== loser.id))
  assert.ok(rels.every((r) => r.artist_id !== r.related_artist_id))
  assert.equal(rels.filter((r) => r.artist_id === x.id && r.related_artist_id === target.id).length, 1)
  assert.equal(rels.filter((r) => r.artist_id === y.id && r.related_artist_id === target.id).length, 1)
})

test('a failure inside the transaction rolls the whole merge back', async () => {
  const target = await createArtist('rollback-target')
  const loser = await createArtist('rollback-loser')
  const album = await createAlbum('rollback-album', loser.id)

  await assert.rejects(db.transaction().execute(async (trx) => {
    await mergeArtistInto(target.id, loser.id, trx)
    throw new Error('boom')
  }))

  assert.ok(await db.selectFrom('artists').select('id').where('id', '=', loser.id).executeTakeFirst())
  const row = await db.selectFrom('albums').select('artist_id').where('id', '=', album.id).executeTakeFirstOrThrow()
  assert.equal(row.artist_id, loser.id)
})

test('regression: track_artists credits move to the target (they cascaded away before)', async () => {
  const target = await createArtist('credits-target')
  const loser = await createArtist('credits-loser')
  const owner = await createArtist('credits-owner')
  const album = await createAlbum('credits-album', owner.id)
  const soloCredit = await createTrack('credits-solo', album.id, owner.id)
  const sharedCredit = await createTrack('credits-shared', album.id, owner.id)

  await db.insertInto('track_artists').values([
    { track_id: soloCredit.id, artist_id: loser.id, role: 'featured', order: 1 },
    { track_id: sharedCredit.id, artist_id: loser.id, role: 'featured', order: 1 },
    { track_id: sharedCredit.id, artist_id: target.id, role: 'guest', order: 2 },
  ]).execute()

  await db.transaction().execute((trx) => mergeArtistInto(target.id, loser.id, trx))

  const rows = await db.selectFrom('track_artists').select(['track_id', 'role'])
    .where('artist_id', '=', target.id).orderBy('track_id').execute()
  assert.deepEqual(rows, [
    { track_id: soloCredit.id, role: 'featured' },
    { track_id: sharedCredit.id, role: 'guest' },
  ])
})

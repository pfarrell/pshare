// server/src/services/artistMergeService.test.ts
import 'dotenv/config'
import { test, after } from 'node:test'
import assert from 'node:assert/strict'
import { db } from '../db/database.js'
import {
  createArtist, createAlbum, createTrack, cleanupFixtures,
  createArtistImage, createFavorite, createUser, createTag, tagArtist, fixtureName,
} from '../test/fixtures.js'
import { mergeArtistInto } from './artistMergeService.js'
import { applyArtistTags } from './musicbrainzTags.js'

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

test('regression: images move to the target, deduping primary/not_found conflicts (they cascaded away before)', async () => {
  const target = await createArtist('images-target')
  const loser = await createArtist('images-loser')

  // Target has no primary yet — loser's primary should become the survivor
  // and artists.image_path (denormalized off the primary row) should sync.
  const loserPrimary = await createArtistImage(loser.id, { isPrimary: true, source: 'fanart' })
  const primaryPath = `/tmp/${fixtureName('images-primary')}.jpg`
  await db.insertInto('media_files').values({
    entity_type: 'image', entity_id: loserPrimary.id, discriminator: 'image',
    absolute_path: primaryPath, name: fixtureName('images-primary'), file_type: 'image',
    created_at: new Date(), updated_at: new Date(),
  }).execute()
  // Both sides checked the same source and found nothing — must collapse to one row.
  const targetNotFound = await createArtistImage(target.id, { status: 'not_found', source: 'lastfm' })
  await createArtistImage(loser.id, { status: 'not_found', source: 'lastfm' })
  // A source only the loser has — should transfer untouched.
  const loserOnly = await createArtistImage(loser.id, { source: 'manual' })

  await db.transaction().execute((trx) => mergeArtistInto(target.id, loser.id, trx))

  const images = await db.selectFrom('images').select(['id', 'is_primary', 'status', 'source'])
    .where('artist_id', '=', target.id).orderBy('id').execute()
  assert.deepEqual(images.map((i) => i.id).sort((a, b) => a - b), [loserPrimary.id, targetNotFound.id, loserOnly.id].sort((a, b) => a - b))
  assert.equal(images.find((i) => i.id === loserPrimary.id)!.is_primary, true)
  assert.equal(images.filter((i) => i.status === 'not_found' && i.source === 'lastfm').length, 1)

  const artist = await db.selectFrom('artists').select('image_path').where('id', '=', target.id).executeTakeFirstOrThrow()
  assert.equal(artist.image_path, primaryPath)
})

test('regression: favorites move to the target, deduping when both sides were favorited (they orphaned before)', async () => {
  const target = await createArtist('favorites-target')
  const loser = await createArtist('favorites-loser')
  const userA = await createUser('favorites-user-a')
  const userB = await createUser('favorites-user-b')

  await createFavorite(userA.id, 'artist', loser.id) // only favorited the loser
  await createFavorite(userB.id, 'artist', loser.id)
  await createFavorite(userB.id, 'artist', target.id) // favorited both — must not violate the unique constraint

  await db.transaction().execute((trx) => mergeArtistInto(target.id, loser.id, trx))

  const favorites = await db.selectFrom('favorites').select(['user_id'])
    .where('kind', '=', 'artist').where('target_id', '=', target.id).execute()
  assert.deepEqual(favorites.map((f) => f.user_id).sort(), [userA.id, userB.id].sort())
})

test('regression: curated tags move to the target, deduping shared tags (they orphaned before)', async () => {
  const target = await createArtist('tags-target')
  const loser = await createArtist('tags-loser')
  const onlyOnLoser = await createTag('tags-only-loser')
  const onBoth = await createTag('tags-on-both')

  await tagArtist(loser.id, onlyOnLoser.id)
  await tagArtist(loser.id, onBoth.id)
  await tagArtist(target.id, onBoth.id)

  await db.transaction().execute((trx) => mergeArtistInto(target.id, loser.id, trx))

  const tagIds = (await db.selectFrom('artists_tags').select('tag_id').where('artist_id', '=', target.id).execute()).map((r) => r.tag_id)
  assert.deepEqual(tagIds.sort(), [onlyOnLoser.id, onBoth.id].sort())
})

test('regression: musicbrainz tags move to the target, deduping shared tags (they cascaded away before)', async () => {
  const target = await createArtist('mbtags-target')
  const loser = await createArtist('mbtags-loser')

  const rockTag = fixtureName('mbtags-rock')
  const sharedTag = fixtureName('mbtags-shared')
  await applyArtistTags(loser.id, 'mbid-loser', [{ name: rockTag, count: 5 }, { name: sharedTag, count: 3 }])
  await applyArtistTags(target.id, 'mbid-target', [{ name: sharedTag, count: 7 }])

  await db.transaction().execute((trx) => mergeArtistInto(target.id, loser.id, trx))

  const rows = await db.selectFrom('artist_mb_tags')
    .innerJoin('mb_tags', 'mb_tags.id', 'artist_mb_tags.tag_id')
    .select(['mb_tags.name', 'artist_mb_tags.tag_count'])
    .where('artist_id', '=', target.id).execute()
  assert.deepEqual(rows.map((r) => r.name).sort(), [rockTag, sharedTag].sort())
  // target's own row for the shared tag must survive untouched, not the loser's
  assert.equal(rows.find((r) => r.name === sharedTag)!.tag_count, 7)
})

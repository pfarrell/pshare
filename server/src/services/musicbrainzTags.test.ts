import 'dotenv/config'
import { test, after } from 'node:test'
import assert from 'node:assert/strict'
import { db } from '../db/database.js'
import { createArtist, createAlbum, cleanupFixtures } from '../test/fixtures.js'
import { applyArtistTags, applyAlbumTags } from './musicbrainzTags.js'

after(cleanupFixtures)

async function tagsFor(artistId: number) {
  return db
    .selectFrom('artist_mb_tags')
    .innerJoin('mb_tags', 'mb_tags.id', 'artist_mb_tags.tag_id')
    .select(['mb_tags.name', 'artist_mb_tags.tag_count', 'artist_mb_tags.source_mbid'])
    .where('artist_id', '=', artistId)
    .orderBy('mb_tags.name')
    .execute()
}

test('applyArtistTags inserts fresh rows', async () => {
  const artist = await createArtist('apply-tags-fresh')
  await applyArtistTags(artist.id, 'mbid-1111', [
    { name: 'rock', count: 10 },
    { name: 'psychedelic', count: 3 },
  ])

  const rows = await tagsFor(artist.id)
  assert.equal(rows.length, 2)
  assert.deepEqual(rows.map(r => r.name), ['psychedelic', 'rock'])
  assert.equal(rows.find(r => r.name === 'rock')!.tag_count, 10)
  assert.ok(rows.every(r => r.source_mbid === 'mbid-1111'))
})

test('applyArtistTags is idempotent on re-run with the same mbid (updates counts, no duplicates)', async () => {
  const artist = await createArtist('apply-tags-idempotent')
  await applyArtistTags(artist.id, 'mbid-2222', [{ name: 'jazz', count: 5 }])
  await applyArtistTags(artist.id, 'mbid-2222', [{ name: 'jazz', count: 9 }])

  const rows = await tagsFor(artist.id)
  assert.equal(rows.length, 1)
  assert.equal(rows[0].tag_count, 9)
})

test('applyArtistTags clears rows from a superseded mbid when the mbid changes', async () => {
  const artist = await createArtist('apply-tags-mbid-change')
  await applyArtistTags(artist.id, 'mbid-old', [{ name: 'blues', count: 4 }])
  await applyArtistTags(artist.id, 'mbid-new', [{ name: 'folk', count: 2 }])

  const rows = await tagsFor(artist.id)
  assert.equal(rows.length, 1)
  assert.equal(rows[0].name, 'folk')
  assert.equal(rows[0].source_mbid, 'mbid-new')
})

test('applyArtistTags clears previously-captured rows when the mirror now resolves zero tags for the current mbid', async () => {
  const artist = await createArtist('apply-tags-now-empty')
  await applyArtistTags(artist.id, 'mbid-3333', [{ name: 'metal', count: 1 }])
  await applyArtistTags(artist.id, 'mbid-3333', [])

  const rows = await tagsFor(artist.id)
  assert.equal(rows.length, 0)
})

test('applyArtistTags does not crash when two different entities share a brand-new tag name', async () => {
  const artistA = await createArtist('apply-tags-shared-a')
  const artistB = await createArtist('apply-tags-shared-b')
  const sharedTagName = `shared-tag-${process.pid}`

  await Promise.all([
    applyArtistTags(artistA.id, 'mbid-shared-a', [{ name: sharedTagName, count: 1 }]),
    applyArtistTags(artistB.id, 'mbid-shared-b', [{ name: sharedTagName, count: 1 }]),
  ])

  const rowsA = await tagsFor(artistA.id)
  const rowsB = await tagsFor(artistB.id)
  assert.equal(rowsA.length, 1)
  assert.equal(rowsB.length, 1)
  assert.equal(rowsA[0].name, sharedTagName)
})

test('applyAlbumTags mirrors the same behavior for albums', async () => {
  const artist = await createArtist('apply-album-tags-artist')
  const album = await createAlbum('apply-album-tags', artist.id)
  await applyAlbumTags(album.id, 'release-mbid-1', [{ name: 'live', count: 2 }])

  const rows = await db
    .selectFrom('album_mb_tags')
    .innerJoin('mb_tags', 'mb_tags.id', 'album_mb_tags.tag_id')
    .select(['mb_tags.name', 'album_mb_tags.source_mbid'])
    .where('album_id', '=', album.id)
    .execute()

  assert.equal(rows.length, 1)
  assert.equal(rows[0].name, 'live')
  assert.equal(rows[0].source_mbid, 'release-mbid-1')
})

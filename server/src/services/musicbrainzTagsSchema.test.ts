import 'dotenv/config'
import { test, after } from 'node:test'
import assert from 'node:assert/strict'
import { db } from '../db/database.js'
import { createArtist, createAlbum, cleanupFixtures, fixtureName } from '../test/fixtures.js'

after(cleanupFixtures)

test('mb_tags/artist_mb_tags/album_mb_tags are queryable and enforce uniqueness + cascade delete', async () => {
  const artist = await createArtist('mb-schema-artist')
  const album = await createAlbum('mb-schema-album', artist.id)

  const tag = await db.insertInto('mb_tags').values({ name: fixtureName('mb-schema-tag') }).returningAll().executeTakeFirstOrThrow()

  await db.insertInto('artist_mb_tags')
    .values({ artist_id: artist.id, source_mbid: 'aaaaaaaa-0000-0000-0000-000000000000', tag_id: tag.id, tag_count: 5 })
    .execute()
  await db.insertInto('album_mb_tags')
    .values({ album_id: album.id, source_mbid: 'bbbbbbbb-0000-0000-0000-000000000000', tag_id: tag.id, tag_count: 3 })
    .execute()

  // Unique (artist_id, tag_id) is enforced
  await assert.rejects(
    db.insertInto('artist_mb_tags')
      .values({ artist_id: artist.id, source_mbid: 'cccccccc-0000-0000-0000-000000000000', tag_id: tag.id, tag_count: 1 })
      .execute()
  )

  // ON DELETE CASCADE removes rows when the artist/album is deleted
  await db.deleteFrom('artists').where('id', '=', artist.id).execute()
  let remaining = await db.selectFrom('artist_mb_tags').selectAll().where('tag_id', '=', tag.id).execute()
  assert.equal(remaining.length, 0)

  // ON DELETE CASCADE also removes album_mb_tags when album is deleted
  await db.deleteFrom('albums').where('id', '=', album.id).execute()
  remaining = await db.selectFrom('album_mb_tags').selectAll().where('tag_id', '=', tag.id).execute()
  assert.equal(remaining.length, 0)
})

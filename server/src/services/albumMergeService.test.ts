// server/src/services/albumMergeService.test.ts
import 'dotenv/config'
import { test, after } from 'node:test'
import assert from 'node:assert/strict'
import { db } from '../db/database.js'
import { createArtist, createAlbum, cleanupFixtures, fixtureName } from '../test/fixtures.js'
import { mergeAlbumInto } from './albumMergeService.js'
import { applyAlbumTags } from './musicbrainzTags.js'

after(cleanupFixtures)

test('regression: musicbrainz tags move to the target, deduping shared tags (they cascaded away before)', async () => {
  const artist = await createArtist('albummbtags-artist')
  const target = await createAlbum('albummbtags-target', artist.id)
  const loser = await createAlbum('albummbtags-loser', artist.id)

  const rockTag = fixtureName('albummbtags-rock')
  const sharedTag = fixtureName('albummbtags-shared')
  await applyAlbumTags(loser.id, 'mbid-loser', [{ name: rockTag, count: 5 }, { name: sharedTag, count: 3 }])
  await applyAlbumTags(target.id, 'mbid-target', [{ name: sharedTag, count: 7 }])

  await db.transaction().execute((trx) => mergeAlbumInto(target.id, loser.id, trx))

  const rows = await db.selectFrom('album_mb_tags')
    .innerJoin('mb_tags', 'mb_tags.id', 'album_mb_tags.tag_id')
    .select(['mb_tags.name', 'album_mb_tags.tag_count'])
    .where('album_id', '=', target.id).execute()
  assert.deepEqual(rows.map((r) => r.name).sort(), [rockTag, sharedTag].sort())
  // target's own row for the shared tag must survive untouched, not the loser's
  assert.equal(rows.find((r) => r.name === sharedTag)!.tag_count, 7)
})

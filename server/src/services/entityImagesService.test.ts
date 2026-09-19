// server/src/services/entityImagesService.test.ts
import 'dotenv/config'
import { test, after } from 'node:test'
import assert from 'node:assert/strict'
import { db } from '../db/database.js'
import { createArtist, cleanupFixtures, fixtureName } from '../test/fixtures.js'
import { entityImagesService } from './entityImagesService.js'

after(cleanupFixtures)

const artistImagePath = async (id: number) =>
  (await db.selectFrom('artists').select('image_path').where('id', '=', id).executeTakeFirstOrThrow()).image_path

test('createRecord as primary syncs parent image_path and demotes the previous primary', async () => {
  const artist = await createArtist('images-primary')
  const first = await entityImagesService.createRecord('artist', artist.id, fixtureName('first.jpg'), 'manual', true)
  const second = await entityImagesService.createRecord('artist', artist.id, fixtureName('second.jpg'), 'manual', true)

  assert.equal(await artistImagePath(artist.id), fixtureName('second.jpg'))
  const rows = await entityImagesService.list('artist', artist.id)
  assert.deepEqual(rows.map((r) => [r.id, r.is_primary]), [[second.id, true], [first.id, false]])
  assert.equal(rows[0].path, fixtureName('second.jpg'))
})

test('setPrimary switches primary and syncs image_path', async () => {
  const artist = await createArtist('images-set')
  const a = await entityImagesService.createRecord('artist', artist.id, fixtureName('a.jpg'), 'manual', true)
  await entityImagesService.createRecord('artist', artist.id, fixtureName('b.jpg'), 'manual', false)
  const b = (await entityImagesService.list('artist', artist.id)).find((r) => !r.is_primary)!

  const updated = await entityImagesService.setPrimary('artist', artist.id, b.id)
  assert.equal(updated?.id, b.id)
  assert.equal(await artistImagePath(artist.id), fixtureName('b.jpg'))
  const aRow = await db.selectFrom('images').select('is_primary').where('id', '=', a.id).executeTakeFirstOrThrow()
  assert.equal(aRow.is_primary, false)
})

test('regression: setPrimary with an image from another entity changes nothing', async () => {
  const artist = await createArtist('images-owner')
  const other = await createArtist('images-other')
  const mine = await entityImagesService.createRecord('artist', artist.id, fixtureName('mine.jpg'), 'manual', true)
  const theirs = await entityImagesService.createRecord('artist', other.id, fixtureName('theirs.jpg'), 'manual', true)

  assert.equal(await entityImagesService.setPrimary('artist', artist.id, theirs.id), undefined)
  const mineRow = await db.selectFrom('images').select('is_primary').where('id', '=', mine.id).executeTakeFirstOrThrow()
  assert.equal(mineRow.is_primary, true)
})

test('remove deletes the image and its media_files row', async () => {
  const artist = await createArtist('images-remove')
  const image = await entityImagesService.createRecord('artist', artist.id, fixtureName('gone.jpg'), 'manual', false)
  assert.equal(await entityImagesService.remove('artist', artist.id, image.id), true)
  assert.equal(await entityImagesService.remove('artist', artist.id, image.id), false)
  const mf = await db.selectFrom('media_files').select('id').where('entity_type', '=', 'image').where('entity_id', '=', image.id).executeTakeFirst()
  assert.equal(mf, undefined)
})

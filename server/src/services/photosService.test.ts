import 'dotenv/config'
import { test, after } from 'node:test'
import assert from 'node:assert/strict'
import { db } from '../db/database.js'
import { photosService } from './photosService.js'

const createdIds: number[] = []
const track = (id: number) => { createdIds.push(id); return id }

after(async () => {
  if (createdIds.length > 0) {
    await db.deleteFrom('media_files').where('entity_type', '=', 'photo').where('entity_id', 'in', createdIds).execute()
    await db.deleteFrom('photos').where('id', 'in', createdIds).execute()
  }
})

test('create writes a photos row and a matching media_files row', async () => {
  const photo = await photosService.create(800, 600, 'test-create.jpg')
  track(photo.id)

  assert.equal(photo.width, 800)
  assert.equal(photo.height, 600)
  const mf = await db.selectFrom('media_files').select(['absolute_path', 'entity_type'])
    .where('entity_type', '=', 'photo').where('entity_id', '=', photo.id).executeTakeFirstOrThrow()
  assert.equal(mf.absolute_path, 'test-create.jpg')
})

test('list returns photos joined to their file path, newest first', async () => {
  const a = await photosService.create(100, 100, 'test-list-a.jpg')
  track(a.id)
  const b = await photosService.create(200, 200, 'test-list-b.jpg')
  track(b.id)

  const rows = await photosService.list()

  const ids = rows.map((r) => r.id)
  assert.ok(ids.indexOf(b.id) < ids.indexOf(a.id))
  const bRow = rows.find((r) => r.id === b.id)
  assert.equal(bRow?.image_path, 'test-list-b.jpg')
})

test('remove deletes both rows and returns the file path for the caller to delete from disk', async () => {
  const photo = await photosService.create(50, 50, 'test-remove.jpg')

  const removed = await photosService.remove(photo.id)

  assert.equal(removed?.path, 'test-remove.jpg')
  const mf = await db.selectFrom('media_files').select('id')
    .where('entity_type', '=', 'photo').where('entity_id', '=', photo.id).executeTakeFirst()
  assert.equal(mf, undefined)
})

test('remove returns undefined for a nonexistent photo', async () => {
  assert.equal(await photosService.remove(999999999), undefined)
})

test('randomAll returns up to size rows with an image_path', async () => {
  const a = await photosService.create(10, 10, 'test-random-a.jpg')
  track(a.id)
  const b = await photosService.create(20, 20, 'test-random-b.jpg')
  track(b.id)

  const result = await photosService.randomAll(1)

  assert.equal(result.rows.length, 1)
  assert.ok(result.rows[0].image_path)
})

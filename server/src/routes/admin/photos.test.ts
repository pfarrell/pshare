import 'dotenv/config'
import { test, after } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'fs'
import path from 'path'
import sharp from 'sharp'
import { Hono } from 'hono'
import adminPhotos from './photos.js'
import { requireAdmin } from '../../middleware/auth.js'
import { db } from '../../db/database.js'
import { imagesDir } from '../../config/paths.js'

const createdIds: number[] = []
const createdFiles: string[] = []

after(async () => {
  if (createdIds.length > 0) {
    await db.deleteFrom('media_files').where('entity_type', '=', 'photo').where('entity_id', 'in', createdIds).execute()
    await db.deleteFrom('photos').where('id', 'in', createdIds).execute()
  }
  for (const filename of createdFiles) {
    fs.rmSync(path.join(imagesDir(), 'photos', filename), { force: true })
    fs.rmSync(path.join(imagesDir(), 'photos', 'sm', filename), { force: true })
  }
})

const appWithUser = (user: any = { id: 1, admin: true }) => {
  const app = new Hono()
  app.use('*', async (c, next) => { if (user) c.set('user' as never, user as never); await next() })
  app.use('*', requireAdmin)
  app.route('/', adminPhotos)
  return app
}

const uploadPng = async (app: Hono, width = 100, height = 80) => {
  const png = await sharp({ create: { width, height, channels: 3, background: '#123456' } }).png().toBuffer()
  const form = new FormData()
  form.append('file', new Blob([png], { type: 'image/png' }), 'test.png')
  return app.request('/photos', { method: 'POST', body: form })
}

test('POST /admin/photos requires admin', async () => {
  const res = await uploadPng(appWithUser({ id: 1, admin: false }))
  assert.equal(res.status, 403)
})

test('POST /admin/photos rejects a request with no file', async () => {
  const res = await appWithUser().request('/photos', { method: 'POST', body: new FormData() })
  assert.equal(res.status, 400)
})

test('POST /admin/photos rejects an unsupported content type', async () => {
  const form = new FormData()
  form.append('file', new Blob([Buffer.from('hello')], { type: 'text/plain' }), 'test.txt')
  const res = await appWithUser().request('/photos', { method: 'POST', body: form })
  assert.equal(res.status, 400)
})

test('POST /admin/photos rejects a file whose declared content-type is an image but whose bytes are not decodable, and writes nothing', async () => {
  const form = new FormData()
  form.append('file', new Blob([Buffer.from('not actually a png')], { type: 'image/png' }), 'fake.png')

  const res = await appWithUser().request('/photos', { method: 'POST', body: form })

  assert.equal(res.status, 400)
  const body = await res.json()
  assert.match(body.error, /could not read image/i)
})

test('POST /admin/photos saves a real file, resizes if needed, creates the sm/ thumbnail, and writes both DB rows', async () => {
  const res = await uploadPng(appWithUser(), 500, 400)

  assert.equal(res.status, 201)
  const body = await res.json()
  createdIds.push(body.id)
  createdFiles.push(body.image_path)

  assert.equal(body.width, 500)
  assert.equal(body.height, 400)
  assert.ok(fs.existsSync(path.join(imagesDir(), 'photos', body.image_path)))
  assert.ok(fs.existsSync(path.join(imagesDir(), 'photos', 'sm', body.image_path)))

  const mf = await db.selectFrom('media_files').select('absolute_path')
    .where('entity_type', '=', 'photo').where('entity_id', '=', body.id).executeTakeFirstOrThrow()
  assert.equal(mf.absolute_path, body.image_path)
})

test('two uploads with the same original filename never collide on disk', async () => {
  const resA = await uploadPng(appWithUser(), 60, 60)
  const bodyA = await resA.json()
  createdIds.push(bodyA.id)
  createdFiles.push(bodyA.image_path)

  const resB = await uploadPng(appWithUser(), 60, 60)
  const bodyB = await resB.json()
  createdIds.push(bodyB.id)
  createdFiles.push(bodyB.image_path)

  assert.notEqual(bodyA.image_path, bodyB.image_path)
  assert.ok(fs.existsSync(path.join(imagesDir(), 'photos', bodyA.image_path)))
  assert.ok(fs.existsSync(path.join(imagesDir(), 'photos', bodyB.image_path)))
})

test('GET /admin/photos lists uploaded photos with their path', async () => {
  const uploadRes = await uploadPng(appWithUser(), 60, 60)
  const uploaded = await uploadRes.json()
  createdIds.push(uploaded.id)
  createdFiles.push(uploaded.image_path)

  const res = await appWithUser().request('/photos')

  assert.equal(res.status, 200)
  const list = await res.json()
  assert.ok(list.some((p: any) => p.id === uploaded.id && p.image_path === uploaded.image_path))
})

test('DELETE /admin/photos/:id removes the DB rows and both files from disk', async () => {
  const uploadRes = await uploadPng(appWithUser(), 60, 60)
  const uploaded = await uploadRes.json()
  const fullPath = path.join(imagesDir(), 'photos', uploaded.image_path)
  const smPath = path.join(imagesDir(), 'photos', 'sm', uploaded.image_path)
  assert.ok(fs.existsSync(fullPath))

  const res = await appWithUser().request(`/photos/${uploaded.id}`, { method: 'DELETE' })

  assert.equal(res.status, 200)
  assert.equal(fs.existsSync(fullPath), false)
  assert.equal(fs.existsSync(smPath), false)
  const mf = await db.selectFrom('media_files').select('id')
    .where('entity_type', '=', 'photo').where('entity_id', '=', uploaded.id).executeTakeFirst()
  assert.equal(mf, undefined)
})

test('DELETE /admin/photos/:id returns 404 for a nonexistent photo', async () => {
  const res = await appWithUser().request('/photos/999999999', { method: 'DELETE' })
  assert.equal(res.status, 404)
})

test('DELETE /admin/photos/:id succeeds even if the file is already missing from disk', async () => {
  const uploadRes = await uploadPng(appWithUser(), 60, 60)
  const uploaded = await uploadRes.json()
  fs.rmSync(path.join(imagesDir(), 'photos', uploaded.image_path), { force: true })
  fs.rmSync(path.join(imagesDir(), 'photos', 'sm', uploaded.image_path), { force: true })

  const res = await appWithUser().request(`/photos/${uploaded.id}`, { method: 'DELETE' })

  assert.equal(res.status, 200)
})

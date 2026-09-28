import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'fs'
import os from 'os'
import path from 'path'
import sharp from 'sharp'
import { readPhotoDimensions, savePhotoFile, PhotoStorageError } from './photoStorage.js'

const tmpRoot = () => fs.mkdtempSync(path.join(os.tmpdir(), 'photostorage-'))

test('readPhotoDimensions reads width/height from real image bytes', async () => {
  const png = await sharp({ create: { width: 800, height: 600, channels: 3, background: '#00ff00' } }).png().toBuffer()

  const dims = await readPhotoDimensions(png)

  assert.deepEqual(dims, { width: 800, height: 600 })
})

test('readPhotoDimensions rejects data sharp cannot decode', async () => {
  await assert.rejects(
    readPhotoDimensions(Buffer.from('not an image')),
    (err: unknown) => err instanceof PhotoStorageError
  )
})

test('savePhotoFile writes the file as-is and creates a sm/ thumbnail when already under the cap', async () => {
  const png = await sharp({ create: { width: 800, height: 600, channels: 3, background: '#0000ff' } }).png().toBuffer()
  const root = tmpRoot()

  await savePhotoFile(png, 'photo-1.png', { width: 800, height: 600 }, root)

  assert.ok(fs.existsSync(path.join(root, 'photos', 'photo-1.png')))
  const full = await sharp(path.join(root, 'photos', 'photo-1.png')).metadata()
  assert.deepEqual([full.width, full.height], [800, 600])
  const thumb = await sharp(path.join(root, 'photos', 'sm', 'photo-1.png')).metadata()
  assert.ok((thumb.width ?? 0) <= 400)
})

test('savePhotoFile resizes an oversized image down to the 1920px cap', async () => {
  const png = await sharp({ create: { width: 4000, height: 3000, channels: 3, background: '#ff00ff' } }).png().toBuffer()
  const root = tmpRoot()

  await savePhotoFile(png, 'photo-2.png', { width: 4000, height: 3000 }, root)

  const full = await sharp(path.join(root, 'photos', 'photo-2.png')).metadata()
  assert.ok((full.width ?? 0) <= 1920)
  assert.ok((full.height ?? 0) <= 1920)
})

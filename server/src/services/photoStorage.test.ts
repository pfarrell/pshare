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

test('readPhotoDimensions swaps width/height for a sideways-tagged (EXIF orientation >= 5) photo', async () => {
  // Phones store portrait photos as landscape pixels plus an EXIF tag
  // ("rotate 90° to display correctly") — orientation 6 here. A reader
  // that ignores the tag shows the photo sideways.
  const jpeg = await sharp({ create: { width: 4000, height: 3000, channels: 3, background: '#00ffff' } })
    .jpeg()
    .withMetadata({ orientation: 6 })
    .toBuffer()

  const dims = await readPhotoDimensions(jpeg)

  assert.deepEqual(dims, { width: 3000, height: 4000 })
})

test('savePhotoFile bakes in EXIF rotation so the saved file is upright with no outstanding orientation tag', async () => {
  const jpeg = await sharp({ create: { width: 4000, height: 3000, channels: 3, background: '#00ffff' } })
    .jpeg()
    .withMetadata({ orientation: 6 })
    .toBuffer()
  const root = tmpRoot()

  const dims = await readPhotoDimensions(jpeg)
  await savePhotoFile(jpeg, 'rotated.jpg', dims, root)

  const saved = await sharp(path.join(root, 'photos', 'rotated.jpg')).metadata()
  assert.ok((saved.width ?? 0) <= 1920)
  assert.ok((saved.height ?? 0) <= 1920)
  assert.ok((saved.height ?? 0) > (saved.width ?? 0), 'expected the saved file to stay portrait, not end up sideways')
  assert.equal(saved.orientation, undefined)
})

test('savePhotoFile cleans up any partial write and throws PhotoStorageError when sharp cannot fully decode the buffer', async () => {
  const full = await sharp({ create: { width: 1000, height: 800, channels: 3, background: '#ff0000' } }).jpeg().toBuffer()
  // A valid JPEG header but a truncated body: readPhotoDimensions/metadata()
  // succeeds (it only reads the header), but the full pixel decode inside
  // savePhotoFile fails.
  const truncated = full.subarray(0, Math.floor(full.length / 3))
  const root = tmpRoot()

  await assert.rejects(
    savePhotoFile(truncated, 'corrupt.jpg', { width: 1000, height: 800 }, root),
    (err: unknown) => err instanceof PhotoStorageError
  )

  assert.equal(fs.existsSync(path.join(root, 'photos', 'corrupt.jpg')), false)
  assert.equal(fs.existsSync(path.join(root, 'photos', 'sm', 'corrupt.jpg')), false)
})

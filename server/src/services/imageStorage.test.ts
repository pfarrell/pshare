// server/src/services/imageStorage.test.ts
import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'fs'
import os from 'os'
import path from 'path'
import sharp from 'sharp'
import { downloadToDisk, ImageStorageError } from './imageStorage.js'

const tmpRoot = () => fs.mkdtempSync(path.join(os.tmpdir(), 'imagestorage-'))

test('downloads to <root>/<subdir>/<name> and creates the sm/ thumbnail', async (t) => {
  const png = await sharp({ create: { width: 800, height: 600, channels: 3, background: '#ff0000' } }).png().toBuffer()
  const fetchMock = t.mock.method(globalThis, 'fetch', async () => new Response(new Uint8Array(png), { status: 200 }))
  const root = tmpRoot()

  const stored = await downloadToDisk('https://example.com/cover.png', 'cover.png', 'albums', root)

  assert.equal(stored, 'cover.png')
  assert.ok(fs.existsSync(path.join(root, 'albums', 'cover.png')))
  const thumb = await sharp(path.join(root, 'albums', 'sm', 'cover.png')).metadata()
  assert.ok((thumb.width ?? 0) <= 400)
  const [, init] = fetchMock.mock.calls[0].arguments as [string, RequestInit]
  assert.match(String((init.headers as Record<string, string>)['User-Agent']), /Bemused/)
})

test('non-2xx response throws ImageStorageError and writes nothing', async (t) => {
  t.mock.method(globalThis, 'fetch', async () => new Response('nope', { status: 404 }))
  const root = tmpRoot()
  await assert.rejects(
    downloadToDisk('https://example.com/missing.png', 'missing.png', 'artists', root),
    (err: unknown) => err instanceof ImageStorageError && err.message === 'Failed to download image from URL'
  )
  assert.equal(fs.existsSync(path.join(root, 'artists', 'missing.png')), false)
})

test('regression: rejects names that are not a plain filename', async (t) => {
  const fetchMock = t.mock.method(globalThis, 'fetch', async () => new Response('x', { status: 200 }))
  for (const name of ['../escape.jpg', 'sub/dir.jpg', '..', '']) {
    await assert.rejects(
      downloadToDisk('https://example.com/x.jpg', name, 'albums', tmpRoot()),
      (err: unknown) => err instanceof ImageStorageError && err.message === 'Invalid image name'
    )
  }
  assert.equal(fetchMock.mock.callCount(), 0)
})

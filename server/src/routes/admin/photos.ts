import { Hono } from 'hono'
import fs from 'fs'
import path from 'path'
import { randomUUID } from 'crypto'
import { photosService } from '../../services/photosService.js'
import { readPhotoDimensions, savePhotoFile, PhotoStorageError } from '../../services/photoStorage.js'
import { imagesDir } from '../../config/paths.js'

const photos = new Hono()

const EXT_BY_MIME: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/gif': 'gif',
}

// GET /admin/photos — the flat pool for the photo-management grid.
photos.get('/photos', async (c) => {
  return c.json(await photosService.list())
})

// POST /admin/photos — real multipart file upload (unlike the album/artist
// image endpoints, which only download-by-URL for external search results —
// personal photos come from the admin's own device, so this needs an actual
// file picker + multipart parse). The stored filename is always
// server-generated (never the client-supplied original name), which closes
// off both path traversal and any collision between two unrelated uploads
// sharing a device-default name like "IMG_1234.jpg".
photos.post('/photos', async (c) => {
  try {
    const body = await c.req.parseBody({ maxSize: 50 * 1024 * 1024 }) // 50MB — generous for a phone photo
    const file = body.file
    if (!file || typeof file === 'string') return c.json({ error: 'No file uploaded' }, 400)

    const ext = EXT_BY_MIME[file.type]
    if (!ext) return c.json({ error: 'Unsupported image type — use JPEG, PNG, WebP, or GIF' }, 400)

    const buffer = Buffer.from(await file.arrayBuffer())
    const { width, height } = await readPhotoDimensions(buffer)
    const filename = `${randomUUID()}.${ext}`
    await savePhotoFile(buffer, filename, { width, height })
    const photo = await photosService.create(width, height, filename)

    return c.json({ id: photo.id, image_path: filename, width, height }, 201)
  } catch (err) {
    if (err instanceof PhotoStorageError) return c.json({ error: err.message }, 400)
    console.error('Error saving photo:', err)
    return c.json({ error: 'Failed to save photo' }, 500)
  }
})

// DELETE /admin/photos/:id
photos.delete('/photos/:id', async (c) => {
  const id = parseInt(c.req.param('id'))
  const removed = await photosService.remove(id)
  if (!removed) return c.json({ error: 'Photo not found' }, 404)

  if (removed.path) {
    fs.rmSync(path.join(imagesDir(), 'photos', removed.path), { force: true })
    fs.rmSync(path.join(imagesDir(), 'photos', 'sm', removed.path), { force: true })
  }

  return c.json({ success: true })
})

export default photos

// server/src/services/photoStorage.ts
// Disk I/O for personal photos (jukebox photo-frame screensaver). Mirrors
// imageStorage.ts's separation of "write bytes to disk" from DB concerns
// (photosService.ts) — but takes an already-uploaded Buffer rather than
// fetching a URL, since these come from the admin's own device via a real
// multipart file picker, not an external image search result.
import fs from 'fs'
import path from 'path'
import sharp from 'sharp'
import { imagesDir } from '../config/paths.js'
import { createSmallVersion } from './imageResize.js'

export class PhotoStorageError extends Error {}

// No kiosk screen needs a raw phone photo's full resolution (routinely
// 4032x3024+) — cap the stored full version well above any realistic
// display size, distinct from the existing 400px sm/ thumbnail cap.
const MAX_DIM = 1920

// Reads a candidate photo's dimensions before any DB row exists for it —
// the route needs these both to decide whether savePhotoFile should resize,
// and to store on the new photos row itself (see photosService.ts). Throws
// PhotoStorageError for anything sharp can't decode: a corrupt file, or a
// format sharp doesn't support without extra libheif support — e.g. a raw
// HEIC upload a browser's file picker passed through unconverted (JPEG,
// PNG, WebP, GIF are supported out of the box; HEIC is a known, accepted
// gap — see the spec).
export async function readPhotoDimensions(buffer: Buffer): Promise<{ width: number; height: number }> {
  let metadata
  try {
    metadata = await sharp(buffer).metadata()
  } catch {
    throw new PhotoStorageError('Could not read image — supported formats: JPEG, PNG, WebP, GIF')
  }
  const { width = 0, height = 0 } = metadata
  if (!width || !height) throw new PhotoStorageError('Could not read image dimensions')
  return { width, height }
}

// Writes the (possibly resized) full version to public/images/photos/<name>
// and creates its sm/ thumbnail — the same 400px cap the admin grid for
// every other image type already expects. `name` is always server-generated
// by the route handler (see admin/photos.ts), never taken from the client,
// so there's no path-traversal surface here the way imageStorage.ts's
// downloadToDisk has to guard against for its client-supplied image_name.
export async function savePhotoFile(
  buffer: Buffer,
  name: string,
  { width, height }: { width: number; height: number },
  rootDir: string = imagesDir()
): Promise<void> {
  const dir = path.join(rootDir, 'photos')
  fs.mkdirSync(dir, { recursive: true })
  const filePath = path.join(dir, name)

  if (width <= MAX_DIM && height <= MAX_DIM) {
    fs.writeFileSync(filePath, buffer)
  } else {
    await sharp(buffer)
      .resize(MAX_DIM, MAX_DIM, { fit: 'inside', withoutEnlargement: true })
      .toFile(filePath)
  }

  await createSmallVersion(filePath)
}

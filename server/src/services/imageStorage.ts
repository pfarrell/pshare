// server/src/services/imageStorage.ts
import fs from 'fs'
import path from 'path'
import { imagesDir } from '../config/paths.js'
import { createSmallVersion } from './imageResize.js'

// A failure the caller should report to the user as a 400.
export class ImageStorageError extends Error {}

const USER_AGENT = 'Mozilla/5.0 (compatible; Bemused/1.0)'

// Downloads an image into public/images/<subdir>/<name> and always creates
// its sm/ thumbnail — every list/grid image context requests /sm/ first.
export async function downloadToDisk(
  url: string,
  name: string,
  subdir: 'albums' | 'artists',
  rootDir: string = imagesDir()
): Promise<string> {
  // image_name comes from the request body; owners (not just admins) can
  // set playlist/collection images, so never let it escape the directory.
  if (!name || name === '.' || name === '..' || path.basename(name) !== name) {
    throw new ImageStorageError('Invalid image name')
  }

  const response = await fetch(url, { headers: { 'User-Agent': USER_AGENT } })
  if (!response.ok) throw new ImageStorageError('Failed to download image from URL')

  const buffer = Buffer.from(await response.arrayBuffer())
  const dir = path.join(rootDir, subdir)
  fs.mkdirSync(dir, { recursive: true })
  const filePath = path.join(dir, name)
  fs.writeFileSync(filePath, buffer)
  await createSmallVersion(filePath)
  return name
}

import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

// Production runs from the symlinked release dir; in development (src/config
// or dist/config) the monorepo root is three levels up.
export const projectRoot = process.env.NODE_ENV === 'production'
  ? '/var/www/bemused-node/current'
  : path.resolve(__dirname, '../../..')

export function imagesDir(subdir?: 'albums' | 'artists'): string {
  return subdir
    ? path.join(projectRoot, 'public', 'images', subdir)
    : path.join(projectRoot, 'public', 'images')
}

export function uploadTmpDir(): string {
  return path.join(projectRoot, 'public', 'tmp', 'uploads')
}

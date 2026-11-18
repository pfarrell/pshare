import fs from 'fs'
import { sql } from 'kysely'
import { db } from '../db/database.js'

// Wakes the music NAS ahead of playback. The NAS spins its disks down when idle and takes 30s+
// to wake; the frontend pings POST /stream/warm when someone starts using the app (opens it,
// returns to it, taps something), so the spin-up overlaps browsing instead of the first play.
//
// The read must actually reach the disks: a block at a random offset of a random file is very
// unlikely to sit in this server's page cache or the NAS's RAM cache, unlike a stat or the
// start of a recently played track.

const BLOCK_SIZE = 4096
const DEFAULT_COOLDOWN_MS = 60_000

type WarmerDeps = {
  pickFile: () => Promise<string | null>
  readBlock: (filePath: string) => Promise<unknown>
  now?: () => number
  // A warm-up finished this recently means the disks are already spinning.
  cooldownMs?: number
  log?: (message: string) => void
}

export function createMusicStoreWarmer({
  pickFile,
  readBlock,
  now = Date.now,
  cooldownMs = DEFAULT_COOLDOWN_MS,
  log = (message) => console.warn(message),
}: WarmerDeps) {
  // At most one in flight: on a hard NFS mount a read blocks (a libuv pool thread) until the
  // NAS answers, and piling more up behind it would only tie up more threads.
  let inFlight: Promise<void> | null = null
  let lastWarmedAt = -Infinity

  return {
    // Starts a warm-up in the background unless one is running or just finished. Never throws
    // and never waits: returns whether a warm-up was started.
    warm(): boolean {
      if (inFlight || now() - lastWarmedAt < cooldownMs) return false
      inFlight = (async () => {
        try {
          const filePath = await pickFile()
          if (filePath) await readBlock(filePath)
          lastWarmedAt = now()
        } catch (err) {
          log(`Music store warm-up failed: ${err instanceof Error ? err.message : String(err)}`)
        } finally {
          inFlight = null
        }
      })()
      return true
    },
    // Test hook: resolves once the current warm-up (if any) settles.
    async idle(): Promise<void> {
      await inFlight
    },
  }
}

// Reads one block-aligned block at a random offset. Returns the number of bytes read.
export async function readRandomBlock(filePath: string): Promise<number> {
  const handle = await fs.promises.open(filePath, 'r')
  try {
    const { size } = await handle.stat()
    if (size === 0) return 0
    const blocks = Math.max(1, Math.floor(size / BLOCK_SIZE))
    const offset = Math.floor(Math.random() * blocks) * BLOCK_SIZE
    const { bytesRead } = await handle.read(Buffer.alloc(BLOCK_SIZE), 0, BLOCK_SIZE, offset)
    return bytesRead
  } finally {
    await handle.close()
  }
}

async function pickRandomMediaFile(): Promise<string | null> {
  // Via tracks: media_files also holds images, which don't live on the music share.
  const row = await db
    .selectFrom('tracks')
    .innerJoin('media_files', 'media_files.id', 'tracks.media_file_id')
    .select('media_files.absolute_path')
    .where('media_files.absolute_path', 'is not', null)
    .orderBy(sql`random()`)
    .limit(1)
    .executeTakeFirst()
  return row?.absolute_path ?? null
}

export const musicStoreWarmer = createMusicStoreWarmer({
  pickFile: pickRandomMediaFile,
  readBlock: readRandomBlock,
})

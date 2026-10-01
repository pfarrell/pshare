import fs from 'fs/promises'

// 'unknown' = nothing to check against (no path recorded, or running somewhere the audio
// share is not mounted); the UI must not paint those as broken.
export type MediaFileStatus = 'ok' | 'missing' | 'empty' | 'unreadable' | 'unknown'

const CONCURRENCY = 16

// Checks whether each audio file is really on disk. The media_files.file_missing flag is
// only ever set by a backfill script (185 of 183k rows in prod), so a file that has
// vanished from the NAS usually still says "not missing"; a stat is the only truth.
export async function checkMediaFiles(
  files: { id: number; absolute_path: string | null; file_missing?: boolean | null }[],
  { skip = false }: { skip?: boolean } = {},
): Promise<Map<number, MediaFileStatus>> {
  const result = new Map<number, MediaFileStatus>()
  if (skip) {
    for (const f of files) result.set(f.id, 'unknown')
    return result
  }

  const check = async (f: (typeof files)[number]): Promise<MediaFileStatus> => {
    if (f.file_missing) return 'missing'
    if (!f.absolute_path) return 'unknown'
    try {
      const stat = await fs.stat(f.absolute_path)
      return stat.isFile() && stat.size > 0 ? 'ok' : stat.isFile() ? 'empty' : 'missing'
    } catch (err) {
      const code = (err as NodeJS.ErrnoException).code
      // ENOENT/ENOTDIR: genuinely absent. Anything else (EACCES, EIO from an unmounted NAS)
      // means we could not tell, which is a different problem from "gone".
      return code === 'ENOENT' || code === 'ENOTDIR' ? 'missing' : 'unreadable'
    }
  }

  const queue = [...files]
  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, queue.length) }, async () => {
    for (let f = queue.shift(); f; f = queue.shift()) result.set(f.id, await check(f))
  }))
  return result
}

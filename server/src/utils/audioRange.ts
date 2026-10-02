import fs from 'fs'

// A leading ID3v2 tag can be megabytes (embedded full-size cover art is the usual
// cause; a few albums in the library carry 6-7 MB of it). A browser has to read all
// of it before the first audio frame, so on a slow link (the kiosk's Wi-Fi manages
// ~0.5 MB/s) playback of one of those tracks starts 12+ seconds late. The player
// never uses the tag - titles and art come from the database - so the stream route
// serves the file as if the tag weren't there. These helpers find where the audio
// starts and translate the client's byte ranges into that shifted view.

const tagLengthCache = new Map<string, number>()

// Bytes occupied by a leading ID3v2 tag (header + body + optional footer), 0 if the
// file has none or the header is malformed. The result is cached per file version.
export async function id3v2TagLength(filePath: string, size: number, mtimeMs: number): Promise<number> {
  const key = `${filePath}:${size}:${mtimeMs}`
  const cached = tagLengthCache.get(key)
  if (cached !== undefined) return cached

  let length = 0
  let handle: fs.promises.FileHandle | undefined
  try {
    handle = await fs.promises.open(filePath, 'r')
    const header = Buffer.alloc(10)
    const { bytesRead } = await handle.read(header, 0, 10, 0)
    if (bytesRead === 10) length = parseId3v2Length(header)
  } catch {
    length = 0
  } finally {
    await handle?.close()
  }

  // The tag must leave room for audio; anything else is treated as "no tag".
  if (length >= size) length = 0

  if (tagLengthCache.size > 5000) tagLengthCache.clear()
  tagLengthCache.set(key, length)
  return length
}

export function parseId3v2Length(header: Buffer): number {
  if (header.length < 10 || header.toString('latin1', 0, 3) !== 'ID3') return 0
  // Size is four 7-bit ("syncsafe") bytes; a byte with the high bit set is not a real tag.
  if ((header[6] | header[7] | header[8] | header[9]) & 0x80) return 0
  const body = (header[6] << 21) | (header[7] << 14) | (header[8] << 7) | header[9]
  const hasFooter = header[3] === 4 && (header[5] & 0x10) !== 0
  return 10 + body + (hasFooter ? 10 : 0)
}

export type ByteRange = { start: number; end: number }

// Parses a single-range `Range: bytes=...` header against a resource of `size` bytes.
// Returns null when there is no (usable) range - serve the whole thing - and
// 'unsatisfiable' when the range lies outside the resource. `end` is clamped to the
// last byte, which a client may legitimately overshoot.
export function parseByteRange(header: string | undefined, size: number): ByteRange | 'unsatisfiable' | null {
  if (!header) return null
  const match = /^bytes=(\d*)-(\d*)$/.exec(header.trim())
  if (!match) return null
  const [, startStr, endStr] = match
  if (startStr === '' && endStr === '') return null

  if (startStr === '') {
    // suffix range: the last N bytes
    const suffix = parseInt(endStr, 10)
    if (suffix === 0) return 'unsatisfiable'
    return { start: Math.max(0, size - suffix), end: size - 1 }
  }

  const start = parseInt(startStr, 10)
  const end = endStr === '' ? size - 1 : Math.min(parseInt(endStr, 10), size - 1)
  if (start >= size || end < start) return 'unsatisfiable'
  return { start, end }
}

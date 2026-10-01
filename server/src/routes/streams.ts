import { Hono } from 'hono'
import { stream } from 'hono/streaming'
import fs from 'fs'
import path from 'path'
import { streamsService } from '../services/streamsService.js'
import { requireAuth } from '../middleware/auth.js'
import type { Variables } from '../types.js'
import { pipeFile } from '../utils/pipeFile.js'

const streams = new Hono()
export const downloads = new Hono<{ Variables: Variables }>()

const CONTENT_TYPES: Record<string, string> = {
  '.mp3': 'audio/mpeg',
  '.flac': 'audio/flac',
  '.m4a': 'audio/mp4',
}

function sanitizeForFilename(value: string): string {
  return value.replace(/["/\\\r\n\x00-\x1f]/g, '').trim() || 'download'
}

function asciiFallback(value: string): string {
  return value.replace(/[^\x20-\x7e]/g, '_')
}

function buildContentDisposition(artistName: string, title: string, fileType: string): string {
  const rawName = `${sanitizeForFilename(artistName)} - ${sanitizeForFilename(title)}${fileType}`
  const asciiName = asciiFallback(rawName)
  const encoded = encodeURIComponent(rawName)
  return `attachment; filename="${asciiName}"; filename*=UTF-8''${encoded}`
}

// GET /stream/:id  — stream an audio file with range request support
streams.get('/:id', async (c) => {
  const id = parseInt(c.req.param('id'))
  if (!Number.isInteger(id)) return c.json({ error: 'Track not found' }, 404)

  const track = await streamsService.findTrackPath(id)

  if (!track?.absolute_path) return c.json({ error: 'Track not found' }, 404)

  // Dev mode: proxy streams to the production server when NAS is unavailable
  const devStreamBase = process.env.BEMUSED_DEV
  if (devStreamBase) {
    const upstream = `${devStreamBase}/stream/${id}`
    const headers: Record<string, string> = { 'Content-Type': 'audio/mpeg' }
    const range = c.req.header('range')
    if (range) headers['Range'] = range

    const proxyRes = await fetch(upstream, { headers })
    return new Response(proxyRes.body, {
      status: proxyRes.status,
      headers: {
        'Content-Type': 'audio/mpeg',
        'Accept-Ranges': 'bytes',
        ...(proxyRes.headers.get('content-range') ? { 'Content-Range': proxyRes.headers.get('content-range')! } : {}),
        ...(proxyRes.headers.get('content-length') ? { 'Content-Length': proxyRes.headers.get('content-length')! } : {}),
      },
    })
  }

  const filePath = path.resolve(track.absolute_path)

  let stat: fs.Stats
  try {
    stat = fs.statSync(filePath)
  } catch {
    return c.json({ error: 'File not found' }, 404)
  }

  const fileSize = stat.size
  const rangeHeader = c.req.header('range')

  if (rangeHeader) {
    const [startStr, endStr] = rangeHeader.replace('bytes=', '').split('-')
    const start = parseInt(startStr, 10)
    const end = endStr ? parseInt(endStr, 10) : fileSize - 1
    const chunkSize = end - start + 1

    return stream(c, async (stream) => {
      c.header('Content-Range', `bytes ${start}-${end}/${fileSize}`)
      c.header('Accept-Ranges', 'bytes')
      c.header('Content-Length', String(chunkSize))
      c.header('Content-Type', 'audio/mpeg')
      c.status(206)

      await pipeFile(stream, filePath, { start, end })
    })
  }

  // No range — stream the whole file
  return stream(c, async (stream) => {
    c.header('Content-Length', String(fileSize))
    c.header('Content-Type', 'audio/mpeg')
    c.header('Accept-Ranges', 'bytes')

    await pipeFile(stream, filePath)
  })
})

// GET /download/:id  — authenticated, full-file download with attachment headers
downloads.get('/:id', requireAuth, async (c) => {
  const id = parseInt(c.req.param('id'))
  const file = await streamsService.findTrackForDownload(id)

  if (!file) return c.json({ error: 'Track not found' }, 404)

  let stat: fs.Stats
  try {
    stat = fs.statSync(file.absolutePath)
  } catch {
    return c.json({ error: 'File not found' }, 404)
  }

  return stream(c, async (streamWriter) => {
    c.header('Content-Length', String(stat.size))
    c.header('Content-Type', CONTENT_TYPES[file.fileType] || 'application/octet-stream')
    c.header('Content-Disposition', buildContentDisposition(file.artistName, file.title, file.fileType))

    await pipeFile(streamWriter, file.absolutePath)
  })
})

export default streams

import { Hono } from 'hono'
import { db } from '../db/database.js'
import fs from 'fs'
import path from 'path'
import { calculateFileHash } from '../utils/fileHash.js'
import { errorLogService } from '../services/errorLogService.js'
import { uploadTmpDir } from '../config/paths.js'

const upload = new Hono()

// Helper to get upload directory
const getUploadDir = () => {
  const uploadDir = uploadTmpDir()

  // Create directory if it doesn't exist
  if (!fs.existsSync(uploadDir)) {
    fs.mkdirSync(uploadDir, { recursive: true })
  }

  return uploadDir
}

// POST /admin/upload - Upload audio files
upload.post('/', async (c) => {
  try {
    // Parse body with larger size limit (2GB)
    const body = await c.req.parseBody({
      all: true,
      maxSize: 2 * 1024 * 1024 * 1024 // 2GB
    })

    // Extract form fields — prefer explicit artist_id/album_id (from picker selection),
    // fall back to artist_name/album_name (free-text or legacy numeric-as-name from old modal)
    const artistIdParam = body.artist_id as string | undefined
    const artistNameParam = body.artist_name as string | undefined
    const albumIdParam = body.album_id as string | undefined
    const albumNameParam = body.album_name as string | undefined

    let artistName: string | null = null
    let artistId: number | null = null
    if (artistIdParam) {
      const parsed = parseInt(artistIdParam)
      if (!isNaN(parsed)) artistId = parsed
    } else if (artistNameParam) {
      const parsed = parseInt(artistNameParam)
      if (!isNaN(parsed) && parsed.toString() === artistNameParam.trim()) {
        artistId = parsed
      } else {
        artistName = artistNameParam
      }
    }

    let albumName: string | null = null
    let albumId: number | null = null
    if (albumIdParam) {
      const parsed = parseInt(albumIdParam)
      if (!isNaN(parsed)) albumId = parsed
    } else if (albumNameParam) {
      const parsed = parseInt(albumNameParam)
      if (!isNaN(parsed) && parsed.toString() === albumNameParam.trim()) {
        albumId = parsed
      } else {
        albumName = albumNameParam
      }
    }

    const genre = body.genre as string | undefined
    const trackPad = body.track_pad ? parseInt(body.track_pad as string) : 0
    const albumArtUrl = body.album_art_url as string | undefined
    const albumArtName = body.album_art_name as string | undefined
    const isCompilation = body.is_compilation === 'true'
    const isSingle = body.is_single === 'true'

    // Get uploaded files
    const files = body.files
    if (!files) {
      return c.json({ error: 'No files uploaded' }, 400)
    }

    // Handle single file or array of files
    const fileArray = Array.isArray(files) ? files : [files]

    const uploadDir = getUploadDir()
    const queuedFiles: any[] = []

    // Process each uploaded file
    for (const file of fileArray) {
      if (typeof file === 'string') continue // Skip non-file fields

      // Read file buffer
      const buffer = await file.arrayBuffer()
      const fileBuffer = Buffer.from(buffer)

      // Save to temporary upload directory
      const filename = file.name || `upload_${Date.now()}.mp3`
      const filePath = path.join(uploadDir, filename)

      fs.writeFileSync(filePath, fileBuffer)

      // Calculate MD5 hash
      const fileHash = await calculateFileHash(filePath)

      // Add to upload queue
      const queueEntry = await db
        .insertInto('upload_queue')
        .values({
          status: 'pending',
          artist_name: artistName || null,
          artist_id: artistId,
          album_name: albumName || null,
          album_id: albumId,
          is_compilation: isCompilation,
          is_single: isSingle,
          genre: genre || null,
          track_pad: trackPad || 0,
          file_path: filePath,
          original_filename: filename,
          file_hash: fileHash,
          file_size: fileBuffer.length,
          album_art_url: albumArtUrl || null,
          album_art_path: albumArtName || null,
        })
        .returningAll()
        .executeTakeFirst()

      queuedFiles.push({
        id: queueEntry?.id,
        filename,
        hash: fileHash,
        size: fileBuffer.length,
      })
    }

    return c.json({
      success: true,
      queued: queuedFiles.length,
      files: queuedFiles,
    })
  } catch (error: any) {
    console.error('Upload error:', error)
    await errorLogService.record({
      source: 'upload',
      message: error.message,
      context: 'POST /admin/upload',
    })
    return c.json({ error: 'Failed to process upload' }, 500)
  }
})

// GET /admin/upload/status - Get status of upload queue
upload.get('/status', async (c) => {
  try {
    const stats = await db
      .selectFrom('upload_queue')
      .select((eb) => [
        eb.fn.count('id').filterWhere('status', '=', 'pending').as('pending'),
        eb.fn.count('id').filterWhere('status', '=', 'processing').as('processing'),
        eb.fn.count('id').filterWhere('status', '=', 'completed').as('completed'),
        eb.fn.count('id').filterWhere('status', '=', 'failed').as('failed'),
      ])
      .executeTakeFirst()

    const recentJobs = await db
      .selectFrom('upload_queue')
      .leftJoin('tracks', 'tracks.id', 'upload_queue.track_id')
      .leftJoin('albums', 'albums.id', 'tracks.album_id')
      .leftJoin('artists', 'artists.id', 'tracks.artist_id')
      .selectAll('upload_queue')
      .select(['albums.title as resolved_album_title', 'artists.name as resolved_artist_name'])
      .orderBy('upload_queue.created_at', 'desc')
      .limit(20)
      .execute()

    return c.json({
      stats,
      recent: recentJobs,
    })
  } catch (error: any) {
    console.error('Status error:', error)
    await errorLogService.record({
      source: 'upload',
      message: error.message,
      context: 'GET /admin/upload/status',
    })
    return c.json({ error: 'Failed to get upload status' }, 500)
  }
})

// GET /admin/upload/recent - Get recent uploads
upload.get('/recent', async (c) => {
  try {
    const limit = parseInt(c.req.query('limit') || '50')

    // Hide completed uploads after 5 minutes (but keep pending/processing/failed)
    const completedCutoff = new Date(Date.now() - 5 * 60 * 1000)

    const recent = await db
      .selectFrom('upload_queue')
      .leftJoin('tracks', 'tracks.id', 'upload_queue.track_id')
      .leftJoin('albums', 'albums.id', 'tracks.album_id')
      .leftJoin('artists', 'artists.id', 'tracks.artist_id')
      .selectAll('upload_queue')
      .select(['albums.id as resolved_album_id', 'albums.title as resolved_album_title', 'artists.name as resolved_artist_name'])
      .where((eb) =>
        eb.or([
          eb('upload_queue.status', '!=', 'completed'),
          eb('upload_queue.completed_at', '>', completedCutoff)
        ])
      )
      .orderBy('upload_queue.created_at', 'desc')
      .limit(limit)
      .execute()

    return c.json(recent)
  } catch (error: any) {
    console.error('Recent uploads error:', error)
    await errorLogService.record({
      source: 'upload',
      message: error.message,
      context: 'GET /admin/upload/recent',
    })
    return c.json({ error: 'Failed to get recent uploads' }, 500)
  }
})

// POST /admin/upload/:id/retry - reset a failed or stuck (processing) upload back to pending
upload.post('/:id/retry', async (c) => {
  const id = parseInt(c.req.param('id'))
  if (isNaN(id)) return c.json({ error: 'Invalid id' }, 400)

  try {
    const item = await db
      .updateTable('upload_queue')
      .set({
        status: 'pending',
        error_message: null,
        started_at: null,
        completed_at: null,
      })
      .where('id', '=', id)
      .where('status', 'in', ['failed', 'processing'])
      .returningAll()
      .executeTakeFirst()

    if (!item) {
      return c.json({ error: 'Upload not found, or not in a retryable state' }, 404)
    }

    return c.json(item)
  } catch (error: any) {
    console.error('Retry upload error:', error)
    await errorLogService.record({
      source: 'upload',
      message: error.message,
      context: `POST /admin/upload/${id}/retry`,
    })
    return c.json({ error: 'Failed to retry upload' }, 500)
  }
})

// DELETE /admin/upload/failed - clear every failed upload_queue row.
// Registered before /:id so 'failed' can never be misrouted there.
// Never touches the filesystem — file_path is left alone.
upload.delete('/failed', async (c) => {
  try {
    const result = await db
      .deleteFrom('upload_queue')
      .where('status', '=', 'failed')
      .executeTakeFirst()

    return c.json({ success: true, deleted: Number(result.numDeletedRows) })
  } catch (error: any) {
    console.error('Clear failed uploads error:', error)
    await errorLogService.record({
      source: 'upload',
      message: error.message,
      context: 'DELETE /admin/upload/failed',
    })
    return c.json({ error: 'Failed to clear failed uploads' }, 500)
  }
})

// DELETE /admin/upload/:id - dismiss a single failed upload_queue row.
// Scoped to status='failed' so a pending/processing job can't be deleted
// out from under itself. Never touches the filesystem.
upload.delete('/:id', async (c) => {
  const id = parseInt(c.req.param('id'))
  if (isNaN(id)) return c.json({ error: 'Invalid id' }, 400)

  try {
    const deleted = await db
      .deleteFrom('upload_queue')
      .where('id', '=', id)
      .where('status', '=', 'failed')
      .returningAll()
      .executeTakeFirst()

    if (!deleted) {
      return c.json({ error: 'Upload not found, or not in a dismissable state' }, 404)
    }

    return c.json({ success: true })
  } catch (error: any) {
    console.error('Dismiss upload error:', error)
    await errorLogService.record({
      source: 'upload',
      message: error.message,
      context: `DELETE /admin/upload/${id}`,
    })
    return c.json({ error: 'Failed to dismiss upload' }, 500)
  }
})

export default upload

#!/usr/bin/env node
import 'dotenv/config'

/**
 * Upload Queue Worker for Bemused
 *
 * Processes pending uploads from the upload_queue table:
 * 1. Extracts ID3 tags from audio files
 * 2. Creates/finds Artist, Album, Track records
 * 3. Moves files to NAS location: $BEMUSED_UPLOAD_PATH/{artist}/{album}/{track}.mp3
 * 4. Creates MediaFile record with hash and links to track
 * 5. Updates queue status to completed/failed
 */

import { db } from '../db/database.js'
import { errorLogService } from '../services/errorLogService.js'
import fs from 'fs'
import path from 'path'
import { parseFile } from 'music-metadata'
import NodeID3 from 'node-id3'
import { lookupAlbumMBID, lookupArtistMBID } from '../services/musicbrainz.js'
import { resolveRecordingMbid } from '../services/recordingResolution.js'
import { fetchSimilarArtists } from '../services/lastfmSimilar.js'
import { sql } from 'kysely'
import { SINGLES_ALBUM_TITLE } from '../constants/singles.js'
import { startFactoidPoller } from './factoidPoller.js'

const POLL_INTERVAL_MS = 5000 // Poll every 5 seconds
const UPLOAD_PATH = process.env.BEMUSED_UPLOAD_PATH

if (!UPLOAD_PATH) {
  console.error('❌ Error: BEMUSED_UPLOAD_PATH environment variable not set')
  process.exit(1)
}

// Helper: coalesce two values, preferring the first if non-empty
function coalesce(first: string | null | undefined, second: string | null | undefined): string {
  if (first && first.trim()) return first.trim()
  if (second && second.trim()) return second.trim()
  return 'no tag'
}

// Helper: safe strip
function safeStrip(val: string | null | undefined): string {
  return val?.trim() || 'not set'
}

// Helper: convert string to number or null
function numberOrNull(value: string | number | null | undefined): number | null {
  if (typeof value === 'number') return value
  if (!value) return null
  const parsed = parseInt(value.toString())
  return isNaN(parsed) ? null : parsed
}

// Helper: extract track number from ID3 tag (handles "5/12" format)
function extractTrackNumber(trackTag: string | null | undefined): number | null {
  if (!trackTag) return null
  const str = trackTag.toString()
  const match = str.match(/^(\d+)/)
  return match ? parseInt(match[1]) : null
}

// Helper: extract track number from filename (e.g., "01 Song.mp3" or "Track 05.mp3")
function extractTrackFromFilename(filename: string): number | null {
  const basename = path.basename(filename, path.extname(filename))

  // Try patterns like "01 Song", "01-Song", "01_Song"
  const leadingNumber = basename.match(/^(\d+)[\s\-_]/)
  if (leadingNumber) return parseInt(leadingNumber[1])

  // Try "Track 01" or "Track01"
  const trackWord = basename.match(/track\s*(\d+)/i)
  if (trackWord) return parseInt(trackWord[1])

  return null
}

// Helper: sanitize filename (remove problematic characters)
function sanitizeFilename(name: string): string {
  return name
    .replace(/\s*:/g, '') // Remove colons with optional spaces
    .replace(/[\(\)\?\"]/g, '') // Remove parens, quotes, question marks
    .trim()
}

// Main processing function
async function processQueueItem(item: any) {
  console.log(`\n🔄 Processing queue item ${item.id}: ${item.original_filename}`)

  try {
    // Update status to processing
    await db
      .updateTable('upload_queue')
      .set({ status: 'processing', started_at: new Date() })
      .where('id', '=', item.id)
      .execute()

    // Check if file exists
    if (!fs.existsSync(item.file_path)) {
      throw new Error(`File not found: ${item.file_path}`)
    }

    // Extract ID3 tags
    console.log('  📖 Reading ID3 tags...')
    const tags = NodeID3.read(item.file_path)
    const metadata = await parseFile(item.file_path)

    // Determine artist, album, and track info
    // Priority: manual input (ID or name) > ID3 tags > filename

    // If an album override was given, fetch it up front so artist resolution
    // can be reconciled against the album's real artist rather than trusting
    // a possibly-mismatched ID3 tag artist (this is exactly why an album
    // override would be used in the first place).
    let overrideAlbum = null
    if (item.album_id && !item.is_single) {
      overrideAlbum = await db
        .selectFrom('albums')
        .selectAll()
        .where('id', '=', item.album_id)
        .executeTakeFirst()

      if (!overrideAlbum) {
        throw new Error(`Album ID ${item.album_id} not found`)
      }
    }

    // Album artist: manual pick (ID) > manual pick (name) > overridden album's
    // artist > ID3 tag.
    let albumArtistId: number | null = null
    let albumArtistName: string

    if (item.artist_id) {
      albumArtistId = item.artist_id
      albumArtistName = '' // Will be looked up from database
    } else if (item.artist_name) {
      albumArtistName = item.artist_name
    } else if (overrideAlbum) {
      albumArtistId = overrideAlbum.artist_id
      albumArtistName = ''
    } else {
      albumArtistName = tags.artist || 'Unknown Artist'
    }

    // Track artist: for a flagged compilation, each track's own ID3 tag always
    // wins — a batch-level artist pick must not stomp on per-track credits.
    // Otherwise, track artist mirrors album artist exactly (unchanged behavior
    // from before this split existed).
    let trackArtistId: number | null = null
    let trackArtistName: string

    if (item.is_compilation) {
      trackArtistName = tags.artist || 'Unknown Artist'
    } else {
      trackArtistId = albumArtistId
      trackArtistName = albumArtistName
    }

    // Handle album similarly — skipped for singles, which always resolve to
    // the artist's _Singles pseudo-album regardless of any album_id/name/tag.
    let albumId: number | null = null
    let albumName: string = ''

    if (!item.is_single) {
      albumId = item.album_id || null
      if (!item.album_id) {
        if (item.album_name) {
          albumName = item.album_name
        } else {
          albumName = tags.album || 'Unknown Album'
        }
      }
    }

    const trackTitle = safeStrip(tags.title) !== 'not set'
      ? safeStrip(tags.title)
      : path.basename(item.file_path, path.extname(item.file_path))

    // Find or create track artist
    let trackArtist
    if (trackArtistId) {
      console.log(`  🎤 Using artist ID: ${trackArtistId}`)
      trackArtist = await db
        .selectFrom('artists')
        .selectAll()
        .where('id', '=', trackArtistId)
        .executeTakeFirst()

      if (!trackArtist) {
        throw new Error(`Artist ID ${trackArtistId} not found`)
      }
      console.log(`  🎤 Found artist: ${trackArtist.name}`)
    } else {
      console.log(`  🎤 Finding/creating artist: ${trackArtistName}`)
      // Find or create by name
      trackArtist = await db
        .selectFrom('artists')
        .selectAll()
        .where('name', '=', trackArtistName)
        .executeTakeFirst()

      if (!trackArtist) {
        trackArtist = await db
          .insertInto('artists')
          .values({ name: trackArtistName })
          .returningAll()
          .executeTakeFirst()

        if (trackArtist) {
          lookupArtistMBID(trackArtist.id, trackArtist.name).catch(err =>
            console.warn(`  ⚠️  Artist MBID lookup failed for "${trackArtistName}":`, err.message)
          )
          fetchSimilarArtists(trackArtist.id, trackArtist.name).catch(err =>
            console.warn(`  ⚠️  Similar artists lookup failed for "${trackArtistName}":`, err.message)
          )
        }
      }
    }

    // Find or create album artist (might be same as track artist)
    let albumArtist
    if (albumArtistId) {
      console.log(`  🎨 Using album artist ID: ${albumArtistId}`)
      albumArtist = await db
        .selectFrom('artists')
        .selectAll()
        .where('id', '=', albumArtistId)
        .executeTakeFirst()

      if (!albumArtist) {
        throw new Error(`Album artist ID ${albumArtistId} not found`)
      }
      console.log(`  🎨 Found album artist: ${albumArtist.name}`)
    } else {
      console.log(`  🎨 Finding/creating album artist: ${albumArtistName}`)
      albumArtist = await db
        .selectFrom('artists')
        .selectAll()
        .where('name', '=', albumArtistName)
        .executeTakeFirst()

      if (!albumArtist) {
        albumArtist = await db
          .insertInto('artists')
          .values({ name: albumArtistName })
          .returningAll()
          .executeTakeFirst()

        if (albumArtist) {
          lookupArtistMBID(albumArtist.id, albumArtist.name).catch(err =>
            console.warn(`  ⚠️  Artist MBID lookup failed for "${albumArtistName}":`, err.message)
          )
          fetchSimilarArtists(albumArtist.id, albumArtist.name).catch(err =>
            console.warn(`  ⚠️  Similar artists lookup failed for "${albumArtistName}":`, err.message)
          )
        }
      }
    }

    // Find or create album
    let album
    if (item.is_single) {
      console.log(`  💿 Finding/creating _Singles album for artist: ${albumArtist!.name}`)
      album = await db
        .selectFrom('albums')
        .selectAll()
        .where('artist_id', '=', albumArtist!.id)
        .where('title', '=', SINGLES_ALBUM_TITLE)
        .executeTakeFirst()

      if (!album) {
        album = await db
          .insertInto('albums')
          .values({ title: SINGLES_ALBUM_TITLE, artist_id: albumArtist!.id })
          .returningAll()
          .executeTakeFirst()
      }
    } else if (albumId) {
      console.log(`  💿 Using album ID: ${albumId}`)
      album = overrideAlbum
      console.log(`  💿 Found album: ${album!.title}`)
    } else {
      console.log(`  💿 Finding/creating album: ${albumName}`)
      album = await db
        .selectFrom('albums')
        .selectAll()
        .where('title', '=', albumName)
        .where('artist_id', '=', albumArtist!.id)
        .executeTakeFirst()

      if (!album) {
        const releaseYear = tags.year || metadata.common.year?.toString() || null
        album = await db
          .insertInto('albums')
          .values({
            title: albumName,
            artist_id: albumArtist!.id,
            release_year: releaseYear,
            is_compilation: item.is_compilation,
          })
          .returningAll()
          .executeTakeFirst()
      }
    }

    // A compilation flag set at upload time is an explicit assertion about
    // the album — stamp it even when reusing an existing album (found by
    // title+artist, or targeted via album_id) that wasn't already flagged.
    if (item.is_compilation && album && !album.is_compilation) {
      album = await db
        .updateTable('albums')
        .set({ is_compilation: true, updated_at: new Date() })
        .where('id', '=', album.id)
        .returningAll()
        .executeTakeFirst()
    }

    // Async MBID lookup — non-blocking, upload success does not depend on it.
    // Skip for _Singles pseudo-albums: mbid-lookup.ts and backfill-release-year.ts
    // both exclude `albums.title != '_Singles'` from this exact operation, since a
    // shared pseudo-album titled "_Singles" can never legitimately match a release.
    if (album && !item.is_single) {
      const trackCountResult = await db
        .selectFrom('tracks')
        .select(db.fn.count<number>('id').as('count'))
        .where('album_id', '=', album.id)
        .executeTakeFirst()
      const trackCount = Number(trackCountResult?.count ?? 0)

      lookupAlbumMBID(
        album.id,
        album.title,
        albumArtist!.name,
        trackCount,
        album.release_year
      ).then(result => {
        if (result.status !== 'unmatched') {
          console.log(`  🎯 MBID assigned to album ${album!.id}: ${result.mbid} (${result.status})`)
        }
      }).catch(err => {
        console.warn(`  ⚠️  MBID lookup failed for album ${album!.id}:`, err.message)
      })
    }

    // Calculate track number: for singles, append after the highest existing
    // track number in that artist's _Singles album (mirrors admin.ts's
    // make-single handler); otherwise ID3 tag > filename > null.
    let trackNumber: string | null
    let rawTrackNumberForMbid: number | null = null

    if (item.is_single) {
      const maxRow = await db
        .selectFrom('tracks')
        .select(sql<number | null>`MAX(track_number::integer)`.as('max_track_number'))
        .where('album_id', '=', album!.id)
        .executeTakeFirst()
      trackNumber = String((maxRow?.max_track_number ?? 0) + 1)
    } else {
      let rawTrackNumber = extractTrackNumber(tags.trackNumber)
      if (rawTrackNumber === null) {
        rawTrackNumber = extractTrackFromFilename(item.original_filename)
      }
      rawTrackNumberForMbid = rawTrackNumber
      const trackPad = item.track_pad || 0
      trackNumber = rawTrackNumber !== null ? (rawTrackNumber + trackPad).toString() : null
    }

    // Get duration from metadata — computed once, unconditionally, since
    // `metadata` was already parsed from item.file_path before any of the
    // branching below, and is needed on both the reuse and new-file paths.
    const durationSec = metadata.format.duration ? Math.round(metadata.format.duration) : null

    // Media-file dedup: reuse an existing media_files row when this exact
    // content (by hash) is already in the library, rather than creating a
    // duplicate copy on disk. Two tracks can legitimately share one
    // media_files row when the same recording appears on multiple
    // releases. `file_missing` rows are excluded from the match — if the
    // previously-known file is gone, treat this upload as re-establishing
    // it rather than linking to a broken reference. The entity_type filter
    // scopes the match to track-linked rows only — media_files also holds
    // non-track rows (entity_type = 'image' for cached artist/album art
    // today, with more entity types planned) and an audio upload must
    // never link to one of those, even on an accidental hash collision
    // (e.g. two unrelated zero-byte/corrupt uploads hashing identically).
    // Track-linked rows carry entity_type IS NULL (the current upload
    // path's convention) OR entity_type = 'track' (migration 011's older
    // convention, still the dominant one for existing library data — most
    // of the real library was created before the newer convention existed,
    // so excluding it here would silently fail to dedupe against the vast
    // majority of an established library). This is deliberately an
    // allowlist of known track-signaling values, not a blocklist of known
    // non-track ones, so a future new entity_type is excluded by default
    // until explicitly added here.
    let mediaFile = await db
      .selectFrom('media_files')
      .selectAll()
      .where('file_hash', '=', item.file_hash)
      .where(eb => eb.or([eb('entity_type', 'is', null), eb('entity_type', '=', 'track')]))
      .where('file_missing', 'is not', true)
      .executeTakeFirst()

    if (mediaFile) {
      // The `file_missing IS NOT TRUE` filter above excludes rows already
      // known to be missing (server/scripts/backfill-file-hash.ts sets and
      // clears this flag on its own periodic runs). That's a periodic, not
      // real-time, signal, so still verify the matched row's file genuinely
      // exists on disk before trusting it: if it's gone (moved, deleted,
      // lost on the NAS), re-establish it from the upload currently being processed
      // rather than either silently linking to a broken path or inserting
      // a second media_files row for the same hash (which would defeat
      // the one-row-per-hash invariant a future UNIQUE constraint on
      // file_hash is meant to enforce).
      if (!mediaFile.absolute_path || !fs.existsSync(mediaFile.absolute_path)) {
        const restoreLocation = mediaFile.absolute_path || path.join(
          UPLOAD_PATH,
          sanitizeFilename(albumArtist!.name),
          sanitizeFilename(album!.title),
          path.basename(item.file_path)
        )

        console.log(`  🔧 Re-establishing missing media_files row ${mediaFile.id} at: ${restoreLocation}`)

        fs.mkdirSync(path.dirname(restoreLocation), { recursive: true })
        fs.copyFileSync(item.file_path, restoreLocation)

        const fileStats = fs.statSync(restoreLocation)
        mediaFile = await db
          .updateTable('media_files')
          .set({
            absolute_path: restoreLocation,
            last_modified: fileStats.mtime,
            file_missing: false,
            updated_at: new Date()
          })
          .where('id', '=', mediaFile.id)
          .returningAll()
          .executeTakeFirst()
      }

      // Hash already exists. Only skip creating a track entirely if one
      // already sits in this exact album pointing at this file — a true
      // accidental re-upload, the same case the old upload.ts dedup check
      // caught. Any other placement (different album/artist) is a
      // legitimate new track sharing the existing file.
      const existingTrackInAlbum = await db
        .selectFrom('tracks')
        .selectAll()
        .where('media_file_id', '=', mediaFile.id)
        .where('album_id', '=', album!.id)
        .executeTakeFirst()

      fs.rmSync(item.file_path, { force: true })

      if (existingTrackInAlbum) {
        console.log(`  ♻️  Hash ${item.file_hash} already has a track in this album — linking to existing track "${existingTrackInAlbum.title}" instead of duplicating`)
        await db
          .updateTable('upload_queue')
          .set({ status: 'completed', completed_at: new Date(), track_id: existingTrackInAlbum.id })
          .where('id', '=', item.id)
          .execute()
        console.log(`✅ Linked duplicate to existing track: ${existingTrackInAlbum.title}`)
        return
      }

      console.log(`  ♻️  Reusing existing media_files row ${mediaFile.id} for hash ${item.file_hash} — new placement, no NAS copy needed`)
    } else {
      // Determine final file location on NAS
      const sanitizedArtist = sanitizeFilename(albumArtist!.name)
      const sanitizedAlbum = sanitizeFilename(album!.title)
      const filename = path.basename(item.file_path)
      const nasLocation = path.join(UPLOAD_PATH, sanitizedArtist, sanitizedAlbum, filename)

      console.log(`  📁 Moving file to: ${nasLocation}`)

      // Create directory if needed
      fs.mkdirSync(path.dirname(nasLocation), { recursive: true })

      // Copy file to NAS location (handles cross-device moves)
      fs.copyFileSync(item.file_path, nasLocation)

      // Delete original file after successful copy
      fs.unlinkSync(item.file_path)

      // Create media_file record (file system info)
      console.log(`  💾 Creating media_file record...`)
      const now = new Date()
      const fileStats = fs.statSync(nasLocation)
      mediaFile = await db
        .insertInto('media_files')
        .values({
          absolute_path: nasLocation,
          file_hash: item.file_hash,
          name: filename,
          file_type: path.extname(filename).toLowerCase(),
          imported_date: now,
          last_modified: fileStats.mtime, // File's actual modification time
          created_at: now,
          updated_at: now,
          file_missing: false
        })
        .returningAll()
        .executeTakeFirst()
    }

    // Find or create track
    console.log(`  🎵 Finding/creating track: ${trackTitle}`)
    let track = await db
      .selectFrom('tracks')
      .selectAll()
      .where('title', '=', trackTitle)
      .where('album_id', '=', album!.id)
      .where('track_number', '=', trackNumber)
      .executeTakeFirst()

    if (!track) {
      track = await db
        .insertInto('tracks')
        .values({
          title: trackTitle,
          track_number: trackNumber,
          album_id: album!.id,
          artist_id: trackArtist!.id,
          media_file_id: mediaFile!.id,
          duration_sec: durationSec
        })
        .returningAll()
        .executeTakeFirst()
    } else {
      // Update existing track
      track = await db
        .updateTable('tracks')
        .set({
          media_file_id: mediaFile!.id,
          duration_sec: durationSec,
          track_number: trackNumber,
          artist_id: trackArtist!.id
        })
        .where('id', '=', track.id)
        .returningAll()
        .executeTakeFirst()
    }

    // Non-blocking recording-level MBID resolution + local fingerprinting —
    // upload success does not depend on it, same pattern as the album MBID
    // lookup above. Skip entirely if this media_files row was reused from
    // an existing upload that's already been through this pipeline.
    // resolveRecordingMbid never rejects (it catches and logs internally).
    if (!mediaFile!.chromaprint_fingerprint) {
      resolveRecordingMbid(
        mediaFile!.id,
        mediaFile!.absolute_path!,
        trackTitle,
        trackArtist!.name,
        rawTrackNumberForMbid,
        { id: album!.id, musicbrainz_id: album!.musicbrainz_id ?? null, mbid_status: album!.mbid_status ?? null }
      )
    }

    // Handle album art if provided
    if (item.album_art_url && item.album_art_path) {
      console.log(`  🖼️  Album art URL provided: ${item.album_art_url}`)
      // Note: Album art download would be handled separately
      // Could trigger similar logic to the existing downloadAlbumImage endpoint
    }

    // Mark as completed
    await db
      .updateTable('upload_queue')
      .set({
        status: 'completed',
        completed_at: new Date(),
        track_id: track!.id
      })
      .where('id', '=', item.id)
      .execute()

    console.log(`✅ Successfully processed: ${trackTitle} by ${trackArtist!.name}`)

  } catch (error: any) {
    console.error(`❌ Error processing queue item ${item.id}:`, error.message)

    await errorLogService.record({
      source: 'upload',
      message: error.message,
      context: item.original_filename,
    })

    // Mark as failed with error message
    await db
      .updateTable('upload_queue')
      .set({
        status: 'failed',
        completed_at: new Date(),
        error_message: error.message
      })
      .where('id', '=', item.id)
      .execute()
  }
}

// A row can be orphaned in 'processing' if the worker process dies mid-item
// (crash, OOM, systemd restart) — the poll loop only ever looks at 'pending'
// rows, so nothing would otherwise notice or recover it.
const STALE_PROCESSING_THRESHOLD_MS = 30 * 60 * 1000 // 30 minutes

async function reclaimStaleProcessingItems() {
  const staleCutoff = new Date(Date.now() - STALE_PROCESSING_THRESHOLD_MS)

  const stale = await db
    .updateTable('upload_queue')
    .set({
      status: 'failed',
      completed_at: new Date(),
      error_message: 'Reclaimed: stuck in "processing" past the worker restart without completing (orphaned by a crashed or restarted worker process). Use Retry once the underlying issue is resolved.'
    })
    .where('status', '=', 'processing')
    .where('started_at', '<', staleCutoff)
    .returning(['id', 'original_filename'])
    .execute()

  for (const item of stale) {
    console.warn(`  ⚠️  Reclaimed stale processing item ${item.id} (${item.original_filename})`)
    await errorLogService.record({
      source: 'upload',
      message: 'Reclaimed: stuck in "processing" past the worker restart without completing.',
      context: item.original_filename,
    })
  }
}

// Main worker loop
async function worker() {
  console.log('🚀 Bemused Upload Queue Worker started')
  console.log(`📁 Upload path: ${UPLOAD_PATH}`)
  console.log(`⏱️  Poll interval: ${POLL_INTERVAL_MS}ms\n`)

  await reclaimStaleProcessingItems()

  // Independent of the upload queue: its own interval, its own spend cap, and
  // an off switch (FACTOIDS_DISABLED=1). It schedules itself with setTimeout,
  // so it does not block the loop below.
  startFactoidPoller()

  while (true) {
    try {
      // Get next pending item
      const item = await db
        .selectFrom('upload_queue')
        .selectAll()
        .where('status', '=', 'pending')
        .orderBy('created_at', 'asc')
        .limit(1)
        .executeTakeFirst()

      if (item) {
        await processQueueItem(item)
      } else {
        // No pending items, wait before polling again
        await new Promise(resolve => setTimeout(resolve, POLL_INTERVAL_MS))
      }

    } catch (error: any) {
      console.error('❌ Worker error:', error)
      // Wait a bit before retrying
      await new Promise(resolve => setTimeout(resolve, POLL_INTERVAL_MS))
    }
  }
}

// Start the worker
worker().catch(error => {
  console.error('💥 Fatal error:', error)
  process.exit(1)
})

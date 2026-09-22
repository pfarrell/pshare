import { Hono } from 'hono'
import { db } from '../../db/database.js'
import { sql } from 'kysely'
import { MBID_RETRYABLE } from './artists.js'
import { imagesDir } from '../../config/paths.js'
import { parseFile } from 'music-metadata'
import fs from 'fs'
import { mergeAlbumInto } from '../../services/albumMergeService.js'

const router = new Hono()

// PUT /admin/album/:id — update an album
router.put('/album/:id', async (c) => {
  const id = parseInt(c.req.param('id'))
  const body = await c.req.json()

  const { title, artist_id, release_year, image_path, wikipedia, is_compilation, musicbrainz_id } = body

  if (!title) {
    return c.json({ error: 'Title is required' }, 400)
  }

  if (!artist_id) {
    return c.json({ error: 'Artist ID is required' }, 400)
  }

  try {
    const { resolveManualMbid } = await import('../../services/mbidService.js')
    const { lookupAlbumMBID } = await import('../../services/musicbrainz.js')
    const { fetchAlbumArtFromCAA } = await import('../../services/coverArtArchive.js')

    const current = await db
      .selectFrom('albums')
      .innerJoin('artists', 'artists.id', 'albums.artist_id')
      .select([
        'albums.title',
        'albums.artist_id',
        'albums.mbid_status',
        'albums.musicbrainz_id',
        'albums.release_year',
        'albums.image_path',
        'artists.name as artist_name',
      ])
      .where('albums.id', '=', id)
      .executeTakeFirst()

    if (!current) {
      return c.json({ error: 'Album not found' }, 404)
    }

    const mbidResult = await resolveManualMbid('release', musicbrainz_id, current.musicbrainz_id)
    if (!mbidResult.ok) {
      const errorResult = mbidResult as { ok: false; status: 400 | 502; error: string }
      return c.json({ error: errorResult.error }, errorResult.status)
    }

    const mbidUpdateWithResult = mbidResult as { ok: true; update: any; entity?: any; sameAsCurrent: boolean }
    const mbidUpdate = mbidUpdateWithResult.update
      ? {
          ...mbidUpdateWithResult.update,
          release_group_musicbrainz_id: mbidUpdateWithResult.update.musicbrainz_id
            ? (mbidUpdateWithResult.entity?.release_group_id ?? null)
            : null,
        }
      : null
    // Prefer the release-group's original release date over this specific
    // edition's — a manually-pasted MBID is often for a remaster/reissue.
    const mbidReleaseYear: string | undefined = mbidUpdateWithResult.update?.musicbrainz_id
      ? (mbidUpdateWithResult.entity?.original_date || mbidUpdateWithResult.entity?.date)?.match(/^\d{4}/)?.[0]
      : undefined
    // Re-pasting the already-stored MBID retries a Cover Art Archive fetch
    // that failed the first time — only while no image is attached yet, so
    // repeated saves don't accumulate duplicate image rows.
    const caaRetryMbid = !mbidUpdateWithResult.update && mbidUpdateWithResult.sameAsCurrent && current.mbid_status === 'manual' && !current.image_path
      ? current.musicbrainz_id ?? undefined
      : undefined

    const updated = await db
      .updateTable('albums')
      .set({
        title,
        artist_id,
        release_year: mbidReleaseYear ?? (release_year || null),
        image_path: image_path || null,
        wikipedia: wikipedia || null,
        is_compilation: Boolean(is_compilation),
        updated_at: new Date(),
        ...(mbidUpdate ?? {}),
      })
      .where('id', '=', id)
      .returningAll()
      .executeTakeFirst()

    if (!updated) {
      return c.json({ error: 'Album not found' }, 404)
    }

    // Re-trigger MBID lookup if matching fields changed and status is retryable
    // (skipped when this same request also manually set/cleared the MBID)
    if (!mbidUpdate && MBID_RETRYABLE.includes(current.mbid_status ?? 'unmatched')) {
      const titleChanged = current.title !== title
      const artistChanged = current.artist_id !== artist_id
      if (titleChanged || artistChanged) {
        // Resolve the new artist name if artist changed
        const artistNamePromise = artistChanged
          ? db.selectFrom('artists').select('name').where('id', '=', artist_id).executeTakeFirst().then(r => r?.name ?? current.artist_name)
          : Promise.resolve(current.artist_name)

        artistNamePromise.then(artistName =>
          lookupAlbumMBID(id, title, artistName, undefined, release_year || null)
        ).catch(err =>
          console.warn(`MBID re-lookup failed for album ${id}:`, err.message)
        )
      }
    }

    // Manually-set MBID: re-run the same side effect (Cover Art Archive image fetch)
    // a fresh auto-match would trigger. Also covers the re-paste-to-retry case
    // above, since fetchAlbumArtFromCAA logs its own failures to error_log.
    const caaFetchMbid = mbidUpdate?.mbid_status === 'manual' ? mbidUpdate.musicbrainz_id : caaRetryMbid
    if (caaFetchMbid) {
      const imgDir = imagesDir()
      fetchAlbumArtFromCAA(id, caaFetchMbid, imgDir).catch(err =>
        console.warn(`Manual MBID image fetch failed for album ${id}:`, err.message)
      )
    }

    return c.json(updated)
  } catch (error) {
    console.error('Error updating album:', error)
    return c.json({ error: 'Failed to update album' }, 500)
  }
})

// DELETE /admin/album/:id — delete an album and cascade to tracks, media_files
router.delete('/album/:id', async (c) => {
  const id = parseInt(c.req.param('id'))

  try {
    const album = await db.selectFrom('albums').selectAll().where('id', '=', id).executeTakeFirst()
    if (!album) return c.json({ error: 'Album not found' }, 404)

    const { deleteAlbumsCascade } = await import('../../services/entityDeleteService.js')
    await db.transaction().execute((trx) => deleteAlbumsCascade([id], trx))
    return c.json({ success: true, deleted: album })
  } catch (error) {
    console.error('Error deleting album:', error)
    return c.json({ error: 'Failed to delete album' }, 500)
  }
})

// GET /admin/album/:idA/compare/:idB — metadata + track lists for two albums,
// side by side. Built for the duplicate-review flow but not tied to it — any
// two album ids work.
router.get('/album/:idA/compare/:idB', async (c) => {
  const idA = parseInt(c.req.param('idA'))
  const idB = parseInt(c.req.param('idB'))
  if (!Number.isInteger(idA) || !Number.isInteger(idB)) {
    return c.json({ error: 'idA and idB must be integers' }, 400)
  }

  const albums = await db
    .selectFrom('albums')
    .leftJoin('artists', 'artists.id', 'albums.artist_id')
    .select([
      'albums.id', 'albums.title', 'albums.artist_id', 'artists.name as artist_name',
      'albums.release_year', 'albums.disc_number', 'albums.is_compilation',
      'albums.musicbrainz_id', 'albums.mbid_confidence', 'albums.mbid_status',
      'albums.created_at', 'albums.updated_at',
    ])
    .where('albums.id', 'in', [idA, idB])
    .execute()

  const albumA = albums.find((a) => a.id === idA)
  const albumB = albums.find((a) => a.id === idB)
  if (!albumA || !albumB) return c.json({ error: 'One or both albums not found' }, 404)

  const tracks = await db
    .selectFrom('tracks')
    .select(['id', 'album_id', 'track_number', 'title', 'duration_sec', 'media_file_id'])
    .where('album_id', 'in', [idA, idB])
    .execute()

  // track_number is stored as text — sort numerically where possible, falling
  // back to string order for anything non-numeric (e.g. "3.5", blank/null).
  const byTrackOrder = (t: typeof tracks[number]) => {
    const n = parseInt(t.track_number ?? '', 10)
    return Number.isNaN(n) ? Infinity : n
  }
  const tracksFor = (albumId: number) =>
    tracks.filter((t) => t.album_id === albumId).sort((x, y) => byTrackOrder(x) - byTrackOrder(y) || (x.track_number ?? '').localeCompare(y.track_number ?? ''))

  const shape = (album: typeof albumA) => ({
    id: album.id, title: album.title, artist_id: album.artist_id, artist_name: album.artist_name,
    release_year: album.release_year, disc_number: album.disc_number, is_compilation: album.is_compilation,
    musicbrainz_id: album.musicbrainz_id, mbid_confidence: album.mbid_confidence, mbid_status: album.mbid_status,
    created_at: album.created_at, updated_at: album.updated_at,
    track_count: tracksFor(album.id).length,
    tracks: tracksFor(album.id).map((t) => ({
      id: t.id, track_number: t.track_number, title: t.title,
      duration_sec: t.duration_sec, media_file_id: t.media_file_id,
    })),
  })

  return c.json({ a: shape(albumA), b: shape(albumB) })
})

// POST /admin/album — create a new album stub
router.post('/album', async (c) => {
  const body = await c.req.json()
  const { title, artist_id } = body

  if (!title?.trim()) return c.json({ error: 'Title is required' }, 400)
  if (!artist_id) return c.json({ error: 'Artist ID is required' }, 400)

  try {
    const artist = await db.selectFrom('artists').select('id').where('id', '=', artist_id).executeTakeFirst()
    if (!artist) return c.json({ error: 'Artist not found' }, 404)

    const album = await db
      .insertInto('albums')
      .values({ title: title.trim(), artist_id })
      .returningAll()
      .executeTakeFirst()

    return c.json(album, 201)
  } catch (error) {
    console.error('Error creating album:', error)
    return c.json({ error: 'Failed to create album' }, 500)
  }
})

// GET /admin/albums/search?q= — album search with artist name and track count
router.get('/albums/search', async (c) => {
  const q = (c.req.query('q') ?? '').trim()
  if (q.length < 2) return c.json([])

  const rows = await db
    .selectFrom('albums')
    .innerJoin('artists', 'artists.id', 'albums.artist_id')
    .leftJoin('tracks', 'tracks.album_id', 'albums.id')
    .select((eb) => [
      'albums.id',
      'albums.title',
      'albums.release_year',
      'artists.name as artist_name',
      eb.fn.count<number>('tracks.id').as('track_count'),
    ])
    .where(sql<boolean>`unaccent(lower(albums.title)) LIKE unaccent(${'%' + q.toLowerCase() + '%'})`)
    .groupBy(['albums.id', 'albums.title', 'albums.release_year', 'artists.name'])
    .orderBy(sql<number>`similarity(unaccent(lower(albums.title)), unaccent(lower(${q})))`, 'desc')
    .limit(10)
    .execute()

  return c.json(rows)
})

// Re-reads tags for a single track's file via music-metadata, which streams
// rather than reading the whole file synchronously (unlike node-id3's
// NodeID3.read, previously used here — a full sync read per track froze the
// entire server for the duration of a large album's preview, since Node is
// single-threaded). Returns null if the file can't be read (no media file
// record, file_missing flag, missing on disk, or a parse error) — callers
// must skip that track rather than propose changes for it.
async function readTrackTags(mediaFile: { absolute_path: string; file_missing: boolean } | undefined): Promise<{
  title: string | undefined
  trackNumber: number | null
  artist: string | undefined
  year: string | undefined
  album: string | undefined
} | null> {
  if (!mediaFile || !mediaFile.absolute_path || mediaFile.file_missing) return null
  if (!fs.existsSync(mediaFile.absolute_path)) return null

  try {
    const metadata = await parseFile(mediaFile.absolute_path)
    const { common } = metadata
    return {
      title: common.title,
      trackNumber: trackNumberFromMetadata(metadata),
      artist: common.artist,
      year: common.year?.toString(),
      album: common.album,
    }
  } catch {
    return null
  }
}

// music-metadata's `common.track` merge does not respect tag-source priority
// the way it does for every other common field (title/artist/album/year) —
// its MetadataCollector special-cases track/disk/movementIndex to
// unconditionally take whichever tag type was parsed last, rather than the
// higher-priority one. A trailing legacy ID3v1 trailer is parsed after
// ID3v2 (it sits at the end of the file), so a stale single-byte ID3v1
// track number silently overwrote a correct ID3v2 TRCK value. Read the
// ID3v2 frame directly instead, matching what NodeID3.read (ID3v2-only)
// previously did for this field; fall back to the merged value for files
// with no ID3v2 tag (e.g. FLAC/Vorbis, or ID3v1-only files).
function trackNumberFromMetadata(metadata: Awaited<ReturnType<typeof parseFile>>): number | null {
  const id3v2TagType = Object.keys(metadata.native).find((t) => t.startsWith('ID3v2'))
  if (id3v2TagType) {
    const trckFrame = metadata.native[id3v2TagType].find((t) => t.id === 'TRCK' || t.id === 'TRK')
    if (trckFrame) {
      const match = String(trckFrame.value).match(/^(\d+)/)
      if (match) return parseInt(match[1], 10)
    }
  }
  return metadata.common.track.no
}

// GET /admin/album/:id/reprocess-preview — re-read ID3 tags from each
// track's file and diff against the DB. Read-only; no writes happen here.
router.get('/album/:id/reprocess-preview', async (c) => {
  const albumId = parseInt(c.req.param('id'))

  const album = await db
    .selectFrom('albums')
    .select(['id', 'title', 'release_year', 'is_compilation'])
    .where('id', '=', albumId)
    .executeTakeFirst()

  if (!album) {
    return c.json({ error: 'Album not found' }, 404)
  }

  const tracks = await db
    .selectFrom('tracks')
    .leftJoin('artists', 'artists.id', 'tracks.artist_id')
    .select([
      'tracks.id as id',
      'tracks.title as title',
      'tracks.track_number as track_number',
      'tracks.media_file_id as media_file_id',
      'artists.id as artist_id',
      'artists.name as artist_name',
    ])
    .where('tracks.album_id', '=', albumId)
    .execute()

  // Batched instead of one media_files lookup per track — on a large album
  // (e.g. a 369-track compilation) that was 369 extra round trips on top of
  // the file reads below.
  const mediaFileIds = tracks
    .map((t) => t.media_file_id)
    .filter((id): id is number => id !== null)
  const mediaFiles = mediaFileIds.length
    ? await db
        .selectFrom('media_files')
        .select(['id', 'absolute_path', 'file_missing'])
        .where('id', 'in', mediaFileIds)
        .execute()
    : []
  const mediaFileById = new Map(mediaFiles.map((mf) => [mf.id, mf]))

  const trackDiffs = []
  const skipped: { track_id: number; reason: string }[] = []
  let proposedYear: string | undefined
  let proposedAlbumTitle: string | undefined

  // Tag reads are async I/O now (see readTrackTags), so a bounded batch of
  // concurrent reads cuts wall-clock time on large albums without opening
  // one connection per track against the file share.
  const TAG_READ_CONCURRENCY = 10
  for (let i = 0; i < tracks.length; i += TAG_READ_CONCURRENCY) {
    const batch = tracks.slice(i, i + TAG_READ_CONCURRENCY)
    const batchTags = await Promise.all(
      batch.map((track) =>
        readTrackTags(track.media_file_id !== null ? mediaFileById.get(track.media_file_id) : undefined)
      )
    )

    for (let j = 0; j < batch.length; j++) {
      const track = batch[j]
      const tags = batchTags[j]

      if (!tags) {
        skipped.push({
          track_id: track.id,
          reason: track.media_file_id ? 'file missing on disk' : 'no media file linked',
        })
        continue
      }

      if (proposedYear === undefined) proposedYear = tags.year
      if (proposedAlbumTitle === undefined) proposedAlbumTitle = tags.album

      const diff: any = {
        id: track.id,
        fields: {
          title: {
            current: track.title,
            proposed: tags.title ?? track.title,
          },
          track_number: {
            current: track.track_number !== null ? parseInt(track.track_number) : null,
            // Fall back to the current value when the file has no track-number
            // tag, same as title/release_year/artist below — never propose
            // blanking a field just because this one file lacks that tag.
            proposed: tags.trackNumber ?? (track.track_number !== null ? parseInt(track.track_number) : null),
          },
        },
      }

      if (album.is_compilation) {
        const proposedName = tags.artist || track.artist_name
        const matched = await db
          .selectFrom('artists')
          .select(['id', 'name'])
          .where('name', '=', proposedName)
          .executeTakeFirst()

        diff.artist = {
          current: track.artist_id ? { id: track.artist_id, name: track.artist_name } : null,
          proposed_name: proposedName,
          matched_artist: matched || null,
        }
      }

      trackDiffs.push(diff)
    }
  }

  return c.json({
    album: {
      id: album.id,
      is_compilation: album.is_compilation,
      fields: {
        title: {
          current: album.title,
          proposed: proposedAlbumTitle ?? album.title,
        },
        release_year: {
          current: album.release_year !== null ? parseInt(album.release_year) : null,
          proposed: proposedYear !== undefined ? parseInt(proposedYear) : (album.release_year !== null ? parseInt(album.release_year) : null),
        },
      },
    },
    tracks: trackDiffs,
    skipped,
  })
})

// POST /admin/album/:id/reprocess-apply — commit only the accepted/edited
// fields from a prior reprocess-preview response, in one transaction.
router.post('/album/:id/reprocess-apply', async (c) => {
  const albumId = parseInt(c.req.param('id'))
  const body = await c.req.json()
  const albumFields = body.album || {}
  const trackFields: any[] = body.tracks || []

  const album = await db
    .selectFrom('albums')
    .select(['id', 'is_compilation'])
    .where('id', '=', albumId)
    .executeTakeFirst()

  if (!album) {
    return c.json({ error: 'Album not found' }, 404)
  }

  if (albumFields.release_year !== undefined && albumFields.release_year !== null) {
    if (!/^\d+$/.test(String(albumFields.release_year))) {
      return c.json({ error: 'album.release_year must be an integer' }, 400)
    }
  }

  for (const t of trackFields) {
    if (t.track_number !== undefined && t.track_number !== null) {
      if (!/^\d+$/.test(String(t.track_number))) {
        return c.json({ error: `tracks[id=${t.id}].track_number must be an integer` }, 400)
      }
    }
    if (t.artist_name !== undefined && !album.is_compilation) {
      return c.json({ error: `tracks[id=${t.id}].artist_name is only allowed on compilation albums` }, 400)
    }
  }

  try {
    await db.transaction().execute(async (trx) => {
      const albumUpdate: any = {}
      if (albumFields.title !== undefined) albumUpdate.title = albumFields.title
      if (albumFields.release_year !== undefined) {
        albumUpdate.release_year = albumFields.release_year === null ? null : String(albumFields.release_year)
      }
      if (Object.keys(albumUpdate).length > 0) {
        albumUpdate.updated_at = new Date()
        await trx.updateTable('albums').set(albumUpdate).where('id', '=', albumId).execute()
      }

      for (const t of trackFields) {
        const trackUpdate: any = {}
        if (t.title !== undefined) trackUpdate.title = t.title
        if (t.track_number !== undefined) {
          trackUpdate.track_number = t.track_number === null ? null : String(t.track_number)
        }

        if (t.artist_name !== undefined) {
          // A null/empty artist_name means "no artist was proposed" (e.g. a
          // compilation track with no assigned artist and no ID3 artist tag
          // on its file) — treat it as "no change" rather than looking up or
          // creating a blank-named artist row.
          const artistName = typeof t.artist_name === 'string' ? t.artist_name.trim() : t.artist_name
          if (artistName) {
            let artist = await trx
              .selectFrom('artists')
              .select('id')
              .where('name', '=', artistName)
              .executeTakeFirst()

            if (!artist) {
              artist = await trx
                .insertInto('artists')
                .values({ name: artistName })
                .returning('id')
                .executeTakeFirstOrThrow()
            }
            trackUpdate.artist_id = artist.id
          }
        }

        if (Object.keys(trackUpdate).length > 0) {
          trackUpdate.updated_at = new Date()
          // Scope to albumId too — a stale/malformed payload posting a track id that
          // belongs to a different album must never write to it. If the id doesn't
          // belong to this album, this simply affects 0 rows (silent no-op for that
          // entry), which is acceptable per the finding's scope.
          await trx.updateTable('tracks').set(trackUpdate).where('id', '=', t.id).where('album_id', '=', albumId).execute()
        }
      }
    })

    return c.json({ success: true })
  } catch (error) {
    console.error('Error applying reprocess changes:', error)
    return c.json({ error: 'Failed to apply changes' }, 500)
  }
})

// POST /admin/album/:id/move-to-artist — move album and all its tracks to a new artist
router.post('/album/:id/move-to-artist', async (c) => {
  const albumId = parseInt(c.req.param('id'))
  const body = await c.req.json()
  const { target_artist_id } = body

  if (!target_artist_id) {
    return c.json({ error: 'target_artist_id is required' }, 400)
  }

  const targetArtistId = parseInt(target_artist_id)

  try {
    // Verify album exists
    const album = await db
      .selectFrom('albums')
      .select(['id', 'artist_id', 'is_compilation'])
      .where('id', '=', albumId)
      .executeTakeFirst()

    if (!album) {
      return c.json({ error: 'Album not found' }, 404)
    }

    // Verify target artist exists
    const targetArtist = await db
      .selectFrom('artists')
      .select('id')
      .where('id', '=', targetArtistId)
      .executeTakeFirst()

    if (!targetArtist) {
      return c.json({ error: 'Target artist not found' }, 404)
    }

    // Update the album
    await db
      .updateTable('albums')
      .set({ artist_id: targetArtistId, updated_at: new Date() })
      .where('id', '=', albumId)
      .execute()

    // Update all tracks for this album — but only when it's a normal album,
    // where every track legitimately shares the album's artist. A compilation's
    // tracks are individually credited (see docs/architecture.md); blindly
    // overwriting tracks.artist_id here would destroy every per-track credit
    // just because the album's own container artist_id changed.
    let tracksMovedCount = 0
    if (!album.is_compilation) {
      const tracksResult = await db
        .updateTable('tracks')
        .set({ artist_id: targetArtistId, updated_at: new Date() })
        .where('album_id', '=', albumId)
        .execute()
      tracksMovedCount = Number(tracksResult[0]?.numUpdatedRows || 0)
    }

    return c.json({
      success: true,
      tracks_moved: tracksMovedCount,
      is_compilation: album.is_compilation,
    })
  } catch (error) {
    console.error('Error moving album to new artist:', error)
    return c.json({ error: 'Failed to move album' }, 500)
  }
})

// POST /admin/album/:id/merge — merge all tracks into another album, then delete this album
// Body: { destination_album_id: number, track_offset: number }
// track_offset is added to each track's track_number (0 = no change)
// Track artist_id is updated to match destination album's artist, unless destination is a flagged compilation
router.post('/album/:id/merge', async (c) => {
  const sourceAlbumId = parseInt(c.req.param('id'))
  const body = await c.req.json()
  const { destination_album_id, track_offset = 0 } = body

  if (!destination_album_id) return c.json({ error: 'destination_album_id is required' }, 400)
  const destId = parseInt(destination_album_id)
  if (sourceAlbumId === destId) return c.json({ error: 'Cannot merge an album into itself' }, 400)

  const destAlbum = await db.selectFrom('albums').select('id').where('id', '=', destId).executeTakeFirst()
  if (!destAlbum) return c.json({ error: 'Destination album not found' }, 404)

  const sourceAlbum = await db.selectFrom('albums').select('id').where('id', '=', sourceAlbumId).executeTakeFirst()
  if (!sourceAlbum) return c.json({ error: 'Source album not found' }, 404)

  try {
    const result = await db.transaction().execute((trx) => mergeAlbumInto(destId, sourceAlbumId, trx, parseInt(track_offset) || 0))
    return c.json({ success: true, tracks_moved: result.tracksMoved })
  } catch (error) {
    console.error('Error merging album:', error)
    return c.json({ error: 'Failed to merge album' }, 500)
  }
})

export default router

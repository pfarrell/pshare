import { Hono } from 'hono'
import { db, pool } from '../db/database.js'
import { sql } from 'kysely'
import { SINGLES_ALBUM_TITLE } from '../constants/singles.js'
import { mergeArtistInto } from '../services/artistMergeService.js'
import { deleteAlbumsCascade } from '../services/entityDeleteService.js'
import {
  lookupAlbumMBID,
  lookupArtistMBID,
} from '../services/musicbrainz.js'
import {
  searchArtistsMB,
  searchReleasesMB,
  searchRecordingsMB,
} from '../services/musicbrainzLocal.js'
import { resolveManualMbid } from '../services/mbidService.js'
import { fetchAlbumArtFromCAA } from '../services/coverArtArchive.js'
import { fetchArtistImageFromFanart } from '../services/fanart.js'
import { fetchSimilarArtists } from '../services/lastfmSimilar.js'
import fs from 'fs'
import { imagesDir } from '../config/paths.js'
import { parseFile } from 'music-metadata'
import { registerEntityImageRoutes } from './entityImageRoutes.js'

const MBID_RETRYABLE = ['unmatched', 'not_found', 'low_confidence']

const admin = new Hono()

// PUT /admin/artist/:id — update an artist
admin.put('/artist/:id', async (c) => {
  const id = parseInt(c.req.param('id'))
  const body = await c.req.json()

  const { name, image_path, wikipedia, musicbrainz_id } = body

  if (!name) {
    return c.json({ error: 'Name is required' }, 400)
  }

  try {
    const current = await db
      .selectFrom('artists')
      .select(['name', 'mbid_status', 'musicbrainz_id'])
      .where('id', '=', id)
      .executeTakeFirst()

    if (!current) {
      return c.json({ error: 'Artist not found' }, 404)
    }

    const mbidResult = await resolveManualMbid('artist', musicbrainz_id, current.musicbrainz_id)
    if (!mbidResult.ok) {
      const errorResult = mbidResult as { ok: false; status: 400 | 502; error: string }
      return c.json({ error: errorResult.error }, errorResult.status)
    }
    const mbidUpdate = mbidResult.update

    const updated = await db
      .updateTable('artists')
      .set({
        name,
        image_path: image_path || null,
        wikipedia: wikipedia || null,
        updated_at: new Date(),
        ...(mbidUpdate ?? {}),
      })
      .where('id', '=', id)
      .returningAll()
      .executeTakeFirst()

    if (!updated) {
      return c.json({ error: 'Artist not found' }, 404)
    }

    // If name changed: merge stubs and re-trigger lookup chain (skipped when this
    // same request also manually set/cleared the MBID, so the auto lookup can't
    // race with — and overwrite — the admin's manual choice)
    if (current.name !== name) {
      mergeArtistStubs(id, name).catch(err =>
        console.warn(`mergeArtistStubs failed for artist ${id}:`, err.message)
      )
      if (!mbidUpdate && MBID_RETRYABLE.includes(current.mbid_status ?? 'unmatched')) {
        const imgDir = imagesDir()
        lookupArtistMBID(id, name).then(async result => {
          if (!result.mbid) return
          await fetchArtistImageFromFanart(id, result.mbid, imgDir)
          await fetchSimilarArtists(id, name)
        }).catch(err =>
          console.warn(`Post-update lookup chain failed for artist ${id}:`, err.message)
        )
      }
    }

    // Manually-set MBID: re-run the same side effects a fresh auto-match would trigger
    if (mbidUpdate?.mbid_status === 'manual' && mbidUpdate.musicbrainz_id) {
      const imgDir = imagesDir()
      const mbid = mbidUpdate.musicbrainz_id
      fetchArtistImageFromFanart(id, mbid, imgDir).catch(err =>
        console.warn(`Manual MBID image fetch failed for artist ${id}:`, err.message)
      )
      fetchSimilarArtists(id, name).catch(err =>
        console.warn(`Manual MBID similar-artist fetch failed for artist ${id}:`, err.message)
      )
    }

    return c.json(updated)
  } catch (error) {
    console.error('Error updating artist:', error)
    return c.json({ error: 'Failed to update artist' }, 500)
  }
})

// PUT /admin/album/:id — update an album
admin.put('/album/:id', async (c) => {
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

// DELETE /admin/artist/:id — delete an artist and cascade to albums, tracks, media_files
admin.delete('/artist/:id', async (c) => {
  const id = parseInt(c.req.param('id'))

  try {
    const artist = await db.selectFrom('artists').select('id').where('id', '=', id).executeTakeFirst()
    if (!artist) return c.json({ error: 'Artist not found' }, 404)

    const deleted = await db.transaction().execute(async (trx) => {
      const albums = await trx.selectFrom('albums').select('id').where('artist_id', '=', id).execute()
      await deleteAlbumsCascade(albums.map((a) => a.id), trx)
      return trx.deleteFrom('artists').where('id', '=', id).returningAll().executeTakeFirst()
    })
    return c.json({ success: true, deleted })
  } catch (error) {
    console.error('Error deleting artist:', error)
    return c.json({ error: 'Failed to delete artist' }, 500)
  }
})

// DELETE /admin/album/:id — delete an album and cascade to tracks, media_files
admin.delete('/album/:id', async (c) => {
  const id = parseInt(c.req.param('id'))

  try {
    const album = await db.selectFrom('albums').selectAll().where('id', '=', id).executeTakeFirst()
    if (!album) return c.json({ error: 'Album not found' }, 404)

    await db.transaction().execute((trx) => deleteAlbumsCascade([id], trx))
    return c.json({ success: true, deleted: album })
  } catch (error) {
    console.error('Error deleting album:', error)
    return c.json({ error: 'Failed to delete album' }, 500)
  }
})

// Merge stub artists whose name is highly similar to the given artist into it.
// Stubs are artists with no albums and no tracks, created by the similar-artist lookup.
async function mergeArtistStubs(artistId: number, name: string): Promise<void> {
  const nameLower = name.toLowerCase()
  const { rows: stubs } = await pool.query<{ id: number; name: string }>(
    `SELECT id, name FROM artists
     WHERE id != $1
       AND NOT EXISTS (SELECT 1 FROM albums WHERE albums.artist_id = artists.id)
       AND NOT EXISTS (SELECT 1 FROM tracks WHERE tracks.artist_id = artists.id)
       AND (
         similarity(lower(name), lower($2)) >= 0.5
         OR lower(name) LIKE $3
         OR $4 LIKE '%' || lower(name) || '%'
       )`,
    [artistId, name, `%${nameLower}%`, nameLower]
  )

  for (const stub of stubs) {
    console.log(`  Merging stub artist "${stub.name}" (id=${stub.id}) into "${name}" (id=${artistId})`)
    await db.transaction().execute((trx) => mergeArtistInto(artistId, stub.id, trx))
    console.log(`  Merged stub artist ${stub.id} into ${artistId}`)
  }
}

// POST /admin/artist — create a new artist stub
admin.post('/artist', async (c) => {
  const body = await c.req.json()
  const { name } = body

  if (!name?.trim()) {
    return c.json({ error: 'Name is required' }, 400)
  }

  try {
    const artist = await db
      .insertInto('artists')
      .values({ name: name.trim() })
      .returningAll()
      .executeTakeFirst()

    if (!artist) return c.json({ error: 'Failed to create artist' }, 500)

    // Merge any matching stubs, then trigger lookup chain
    mergeArtistStubs(artist.id, artist.name).catch(err =>
      console.warn(`mergeArtistStubs failed for new artist ${artist.id}:`, err.message)
    )

    const imgDir = imagesDir()
    lookupArtistMBID(artist.id, artist.name).then(async result => {
      if (!result.mbid) return
      await fetchArtistImageFromFanart(artist.id, result.mbid, imgDir)
      await fetchSimilarArtists(artist.id, artist.name)
    }).catch(err =>
      console.warn(`Post-create lookup chain failed for artist ${artist.id}:`, err.message)
    )

    return c.json(artist, 201)
  } catch (error) {
    console.error('Error creating artist:', error)
    return c.json({ error: 'Failed to create artist' }, 500)
  }
})

// POST /admin/album — create a new album stub
admin.post('/album', async (c) => {
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

// GET /admin/artists/search?q= — artist search including stubs (no albums required)
admin.get('/artists/search', async (c) => {
  const q = (c.req.query('q') ?? '').trim()
  if (q.length < 2) return c.json([])

  const rows = await db
    .selectFrom('artists')
    .leftJoin('albums', 'albums.artist_id', 'artists.id')
    .select((eb) => [
      'artists.id',
      'artists.name',
      'artists.image_path',
      eb.fn.count<number>('albums.id').as('album_count'),
    ])
    .where(sql<boolean>`unaccent(lower(artists.name)) LIKE unaccent(${'%' + q.toLowerCase() + '%'})`)
    .groupBy(['artists.id', 'artists.name', 'artists.image_path'])
    .orderBy(sql<number>`similarity(unaccent(lower(artists.name)), unaccent(lower(${q})))`, 'desc')
    .limit(20)
    .execute()

  return c.json(rows)
})

// GET /admin/albums/search?q= — album search with artist name and track count
admin.get('/albums/search', async (c) => {
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

// GET /admin/tags — list all tags with usage counts, for the tag moderation page
admin.get('/tags', async (c) => {
  const rows = await db
    .selectFrom('tags')
    .leftJoin('artists_tags', 'artists_tags.tag_id', 'tags.id')
    .leftJoin('albums_tags', 'albums_tags.tag_id', 'tags.id')
    .select((eb) => [
      'tags.id',
      'tags.name',
      eb.fn.count<number>('artists_tags.artist_id').distinct().as('artist_count'),
      eb.fn.count<number>('albums_tags.album_id').distinct().as('album_count'),
    ])
    .groupBy(['tags.id', 'tags.name'])
    .orderBy('tags.name', 'asc')
    .execute()

  return c.json(rows)
})

// DELETE /admin/tags/:id — delete a tag entirely, removing it from every artist/album
admin.delete('/tags/:id', async (c) => {
  const id = parseInt(c.req.param('id'))

  try {
    const tag = await db.selectFrom('tags').select('id').where('id', '=', id).executeTakeFirst()
    if (!tag) return c.json({ error: 'Tag not found' }, 404)

    await db.deleteFrom('artists_tags').where('tag_id', '=', id).execute()
    await db.deleteFrom('albums_tags').where('tag_id', '=', id).execute()
    const deleted = await db.deleteFrom('tags').where('id', '=', id).returningAll().executeTakeFirst()

    return c.json({ success: true, deleted })
  } catch (error) {
    console.error('Error deleting tag:', error)
    return c.json({ error: 'Failed to delete tag' }, 500)
  }
})

// GET /admin/musicbrainz/search-artist?q= — proxy an artist search to MusicBrainz
admin.get('/musicbrainz/search-artist', async (c) => {
  const q = (c.req.query('q') ?? '').trim()
  if (q.length < 2) return c.json([])

  try {
    const results = await searchArtistsMB(q)
    return c.json(results)
  } catch (error) {
    console.error('MusicBrainz artist search failed:', error)
    return c.json({ error: 'Could not reach MusicBrainz to search — try again' }, 502)
  }
})

// GET /admin/musicbrainz/search-release?q= — proxy a release search to MusicBrainz
admin.get('/musicbrainz/search-release', async (c) => {
  const q = (c.req.query('q') ?? '').trim()
  if (q.length < 2) return c.json([])

  try {
    const results = await searchReleasesMB(q)
    return c.json(results)
  } catch (error) {
    console.error('MusicBrainz release search failed:', error)
    return c.json({ error: 'Could not reach MusicBrainz to search — try again' }, 502)
  }
})

// GET /admin/musicbrainz/search-recording?q= — recording search against the local MusicBrainz mirror
admin.get('/musicbrainz/search-recording', async (c) => {
  const q = (c.req.query('q') ?? '').trim()
  const artist = (c.req.query('artist') ?? '').trim() || undefined
  if (q.length < 2) return c.json([])

  try {
    const results = await searchRecordingsMB(q, artist)
    return c.json(results)
  } catch (error) {
    console.error('MusicBrainz recording search failed:', error)
    return c.json({ error: 'Could not reach MusicBrainz to search — try again' }, 502)
  }
})

// GET /admin/artist/:id/merge-stubs — preview which stubs would be merged
admin.get('/artist/:id/merge-stubs', async (c) => {
  const id = parseInt(c.req.param('id'))
  try {
    const artist = await db.selectFrom('artists').select(['id', 'name']).where('id', '=', id).executeTakeFirst()
    if (!artist) return c.json({ error: 'Artist not found' }, 404)

    const { rows } = await pool.query<{ id: number; name: string; similarity: number; album_count: number }>(
      `SELECT a.id, a.name,
              similarity(lower(a.name), lower($1)) AS similarity,
              COUNT(al.id) AS album_count
       FROM artists a
       LEFT JOIN albums al ON al.artist_id = a.id
       WHERE a.id != $2
         AND similarity(lower(a.name), lower($1)) >= 0.5
       GROUP BY a.id, a.name
       ORDER BY similarity DESC`,
      [artist.name, id]
    )

    return c.json(rows)
  } catch (error) {
    console.error('Error previewing stubs:', error)
    return c.json({ error: 'Failed to preview stubs' }, 500)
  }
})

// POST /admin/artist/:id/merge — merge one or more other artists into this one.
// Direction-agnostic: the frontend decides which artist survives by choosing
// which id goes in the URL vs loser_ids (see docs/superpowers/specs/2026-07-05-artist-merge-ux-design.md).
admin.post('/artist/:id/merge', async (c) => {
  const id = parseInt(c.req.param('id'))
  const body = await c.req.json()
  const loserIds: number[] = body.loser_ids ?? []
  if (loserIds.length === 0) return c.json({ error: 'No loser_ids provided' }, 400)
  if (loserIds.includes(id)) return c.json({ error: 'Cannot merge an artist into itself' }, 400)

  try {
    const artist = await db.selectFrom('artists').select(['id', 'name']).where('id', '=', id).executeTakeFirst()
    if (!artist) return c.json({ error: 'Artist not found' }, 404)

    await db.transaction().execute(async (trx) => {
      for (const loserId of loserIds) {
        const loser = await trx.selectFrom('artists').select(['id', 'name']).where('id', '=', loserId).executeTakeFirst()
        if (!loser) continue
        console.log(`  Merging "${loser.name}" (id=${loser.id}) into "${artist.name}" (id=${artist.id})`)
        await mergeArtistInto(artist.id, loser.id, trx)
      }
    })

    return c.json({ success: true, merged: loserIds.length })
  } catch (error) {
    console.error('Error merging artists:', error)
    return c.json({ error: 'Failed to merge artists' }, 500)
  }
})

// GET /admin/track/:id — full admin detail for a single track
admin.get('/track/:id', async (c) => {
  const id = parseInt(c.req.param('id'))

  const track = await db
    .selectFrom('tracks')
    .selectAll()
    .where('id', '=', id)
    .executeTakeFirst()

  if (!track) return c.json({ error: 'Track not found' }, 404)

  const [mediaFile, album, artist, collaborators] = await Promise.all([
    track.media_file_id
      ? db.selectFrom('media_files').selectAll().where('id', '=', track.media_file_id).executeTakeFirst()
      : Promise.resolve(null),
    db.selectFrom('albums').selectAll().where('id', '=', track.album_id).executeTakeFirst(),
    track.artist_id
      ? db.selectFrom('artists').selectAll().where('id', '=', track.artist_id).executeTakeFirst()
      : Promise.resolve(null),
    db
      .selectFrom('track_artists')
      .innerJoin('artists', 'artists.id', 'track_artists.artist_id')
      .select([
        'track_artists.id',
        'track_artists.artist_id',
        'track_artists.role',
        'track_artists.order',
        'artists.name as artist_name',
      ])
      .where('track_artists.track_id', '=', id)
      .orderBy('track_artists.order', 'asc')
      .execute(),
  ])

  return c.json({ track, mediaFile: mediaFile ?? null, album: album ?? null, artist: artist ?? null, collaborators })
})

// PUT /admin/track/:id — update a track
admin.put('/track/:id', async (c) => {
  const id = parseInt(c.req.param('id'))
  const body = await c.req.json()

  const { title, track_number, album_id, artist_id, release_year, wikipedia } = body

  if (album_id !== undefined && album_id !== null) {
    const album = await db.selectFrom('albums').select('id').where('id', '=', album_id).executeTakeFirst()
    if (!album) {
      return c.json({ error: 'Album not found' }, 400)
    }
  }

  try {
    const updated = await db
      .updateTable('tracks')
      .set({
        ...(title !== undefined && { title }),
        ...(track_number !== undefined && { track_number }),
        ...(album_id !== undefined && { album_id }),
        ...(artist_id !== undefined && { artist_id }),
        ...(release_year !== undefined && { release_year }),
        ...(wikipedia !== undefined && { wikipedia }),
        updated_at: new Date(),
      })
      .where('id', '=', id)
      .returningAll()
      .executeTakeFirst()

    if (!updated) {
      return c.json({ error: 'Track not found' }, 404)
    }

    return c.json(updated)
  } catch (error) {
    console.error('Error updating track:', error)
    return c.json({ error: 'Failed to update track' }, 500)
  }
})

// POST /admin/track/:id/collaborators — add a credited (non-primary) artist to a track
admin.post('/track/:id/collaborators', async (c) => {
  const trackId = parseInt(c.req.param('id'))
  const body = await c.req.json()
  const { artist_id, role } = body

  if (!artist_id || !role) {
    return c.json({ error: 'artist_id and role are required' }, 400)
  }
  if (!['featured', 'guest', 'collaborator'].includes(role)) {
    return c.json({ error: 'Invalid role. Must be featured, guest, or collaborator' }, 400)
  }

  const track = await db.selectFrom('tracks').select(['id', 'artist_id']).where('id', '=', trackId).executeTakeFirst()
  if (!track) return c.json({ error: 'Track not found' }, 404)
  if (track.artist_id === artist_id) {
    return c.json({ error: 'This artist is already the primary artist on this track' }, 400)
  }

  try {
    const existing = await db
      .selectFrom('track_artists')
      .select('order')
      .where('track_id', '=', trackId)
      .execute()
    const nextOrder = existing.length > 0 ? Math.max(...existing.map(r => r.order)) + 1 : 1

    const inserted = await db
      .insertInto('track_artists')
      .values({ artist_id, track_id: trackId, role, order: nextOrder })
      .returningAll()
      .executeTakeFirst()

    return c.json(inserted)
  } catch (error: any) {
    if (error.code === '23505') {
      return c.json({ error: 'This artist is already a collaborator on this track' }, 409)
    }
    console.error('Error adding track collaborator:', error)
    return c.json({ error: 'Failed to add collaborator' }, 500)
  }
})

// DELETE /admin/track/:id/collaborators/:collaboratorId — remove a credited artist from a track
admin.delete('/track/:id/collaborators/:collaboratorId', async (c) => {
  const collaboratorId = parseInt(c.req.param('collaboratorId'))

  try {
    const deleted = await db
      .deleteFrom('track_artists')
      .where('id', '=', collaboratorId)
      .returningAll()
      .executeTakeFirst()

    if (!deleted) {
      return c.json({ error: 'Collaborator not found' }, 404)
    }
    return c.json({ success: true })
  } catch (error) {
    console.error('Error removing track collaborator:', error)
    return c.json({ error: 'Failed to remove collaborator' }, 500)
  }
})

// PUT /admin/track/:id/recording-mbid — set/clear this track's media file's recording MBID
admin.put('/track/:id/recording-mbid', async (c) => {
  const id = parseInt(c.req.param('id'))
  const body = await c.req.json()
  const { musicbrainz_recording_id } = body

  const track = await db.selectFrom('tracks').select(['id', 'media_file_id']).where('id', '=', id).executeTakeFirst()
  if (!track) return c.json({ error: 'Track not found' }, 404)
  if (!track.media_file_id) return c.json({ error: 'Track has no associated media file' }, 404)

  const mbid = typeof musicbrainz_recording_id === 'string' && musicbrainz_recording_id.trim()
    ? musicbrainz_recording_id.trim()
    : null

  try {
    const updated = await db
      .updateTable('media_files')
      .set({
        musicbrainz_recording_id: mbid,
        mbid_confidence: mbid ? 1.0 : null,
        mbid_status: mbid ? 'manual' : 'unmatched',
        updated_at: new Date(),
      })
      .where('id', '=', track.media_file_id)
      .returningAll()
      .executeTakeFirst()

    return c.json(updated)
  } catch (error) {
    console.error('Error updating recording MBID:', error)
    return c.json({ error: 'Failed to update recording MBID' }, 500)
  }
})

// POST /admin/track/:id/make-single — removes a track from its album and files
// it under the track's own artist's singles pseudo-album (an album titled
// '_Singles', one per artist; read by GET /artist/:id, see routes/artists.ts).
// Creates that album on first use for the artist. The track's artist_id is
// left unchanged — it's what determines which artist's singles it joins,
// which matters for a compilation track credited to someone other than the
// album's nominal artist.

admin.post('/track/:id/make-single', async (c) => {
  const id = parseInt(c.req.param('id'))

  const track = await db
    .selectFrom('tracks')
    .select(['id', 'artist_id'])
    .where('id', '=', id)
    .executeTakeFirst()

  if (!track) return c.json({ error: 'Track not found' }, 404)
  if (!track.artist_id) return c.json({ error: 'Track has no artist' }, 400)

  try {
    let singlesAlbum = await db
      .selectFrom('albums')
      .select(['id'])
      .where('artist_id', '=', track.artist_id)
      .where('title', '=', SINGLES_ALBUM_TITLE)
      .executeTakeFirst()

    if (!singlesAlbum) {
      singlesAlbum = await db
        .insertInto('albums')
        .values({ title: SINGLES_ALBUM_TITLE, artist_id: track.artist_id })
        .returning(['id'])
        .executeTakeFirstOrThrow()
    }

    const maxTrackNumberRow = await db
      .selectFrom('tracks')
      .select(sql<number | null>`MAX(track_number::integer)`.as('max_track_number'))
      .where('album_id', '=', singlesAlbum.id)
      .executeTakeFirst()

    const nextTrackNumber = (maxTrackNumberRow?.max_track_number ?? 0) + 1

    const updated = await db
      .updateTable('tracks')
      .set({ album_id: singlesAlbum.id, track_number: String(nextTrackNumber), updated_at: new Date() })
      .where('id', '=', id)
      .returningAll()
      .executeTakeFirst()

    return c.json({ ...updated, album: { id: singlesAlbum.id, title: SINGLES_ALBUM_TITLE } })
  } catch (error) {
    console.error('Error making track a single:', error)
    return c.json({ error: 'Failed to make track a single' }, 500)
  }
})

// DELETE /admin/track/:id — delete a track
admin.delete('/track/:id', async (c) => {
  const id = parseInt(c.req.param('id'))

  try {
    const deleted = await db
      .deleteFrom('tracks')
      .where('id', '=', id)
      .returningAll()
      .executeTakeFirst()

    if (!deleted) {
      return c.json({ error: 'Track not found' }, 404)
    }

    return c.json({ success: true, deleted })
  } catch (error) {
    console.error('Error deleting track:', error)
    return c.json({ error: 'Failed to delete track' }, 500)
  }
})

// POST /admin/album/:id/move-to-artist — move album and all its tracks to a new artist
admin.post('/album/:id/move-to-artist', async (c) => {
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
admin.post('/album/:id/merge', async (c) => {
  const sourceAlbumId = parseInt(c.req.param('id'))
  const body = await c.req.json()
  const { destination_album_id, track_offset = 0 } = body

  if (!destination_album_id) return c.json({ error: 'destination_album_id is required' }, 400)
  if (sourceAlbumId === parseInt(destination_album_id)) return c.json({ error: 'Cannot merge an album into itself' }, 400)

  const destAlbum = await db
    .selectFrom('albums')
    .select(['id', 'artist_id', 'is_compilation'])
    .where('id', '=', parseInt(destination_album_id))
    .executeTakeFirst()

  if (!destAlbum) return c.json({ error: 'Destination album not found' }, 404)

  const sourceAlbum = await db
    .selectFrom('albums')
    .select('id')
    .where('id', '=', sourceAlbumId)
    .executeTakeFirst()

  if (!sourceAlbum) return c.json({ error: 'Source album not found' }, 404)

  try {
    const offset = parseInt(track_offset) || 0

    if (offset > 0) {
      await db
        .updateTable('tracks')
        .set({ track_number: sql`track_number::integer + ${offset}`, updated_at: new Date() })
        .where('album_id', '=', sourceAlbumId)
        .execute()
    }

    const updateSet: Record<string, any> = { album_id: destAlbum.id, updated_at: new Date() }
    if (!destAlbum.is_compilation) {
      updateSet.artist_id = destAlbum.artist_id
    }

    const result = await db
      .updateTable('tracks')
      .set(updateSet)
      .where('album_id', '=', sourceAlbumId)
      .execute()

    await db.deleteFrom('albums').where('id', '=', sourceAlbumId).execute()

    return c.json({ success: true, tracks_moved: Number(result[0]?.numUpdatedRows || 0) })
  } catch (error) {
    console.error('Error merging album:', error)
    return c.json({ error: 'Failed to merge album' }, 500)
  }
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
admin.get('/album/:id/reprocess-preview', async (c) => {
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
admin.post('/album/:id/reprocess-apply', async (c) => {
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

// GET /admin/album/:id/artists — list non-primary artists for an album
admin.get('/album/:id/artists', async (c) => {
  const id = parseInt(c.req.param('id'))
  try {
    const rows = await db
      .selectFrom('artist_albums')
      .innerJoin('artists', 'artists.id', 'artist_albums.artist_id')
      .select([
        'artist_albums.artist_id',
        'artist_albums.role',
        'artist_albums.order',
        'artists.name',
      ])
      .where('artist_albums.album_id', '=', id)
      .where('artist_albums.role', '!=', 'primary')
      .orderBy('artist_albums.order', 'asc')
      .execute()
    return c.json(rows)
  } catch (error) {
    console.error('Error fetching album artists:', error)
    return c.json({ error: 'Failed to fetch album artists' }, 500)
  }
})

// POST /admin/album/:id/artists — add a non-primary artist to an album
admin.post('/album/:id/artists', async (c) => {
  const albumId = parseInt(c.req.param('id'))
  const body = await c.req.json()
  const { artist_id, role } = body

  if (!artist_id || !role) {
    return c.json({ error: 'artist_id and role are required' }, 400)
  }
  if (!['compilation', 'featured', 'guest', 'collaborator', 'composer', 'performer'].includes(role)) {
    return c.json({ error: 'Invalid role. Must be compilation, featured, guest, collaborator, composer, or performer' }, 400)
  }

  try {
    const existing = await db
      .selectFrom('artist_albums')
      .select('order')
      .where('album_id', '=', albumId)
      .execute()
    const nextOrder = existing.length > 0 ? Math.max(...existing.map(r => r.order)) + 1 : 1

    const inserted = await db
      .insertInto('artist_albums')
      .values({ artist_id, album_id: albumId, role, order: nextOrder })
      .returningAll()
      .executeTakeFirst()

    return c.json(inserted)
  } catch (error: any) {
    if (error.code === '23505') {
      return c.json({ error: 'This artist is already associated with this album' }, 409)
    }
    console.error('Error adding artist to album:', error)
    return c.json({ error: 'Failed to add artist to album' }, 500)
  }
})

// DELETE /admin/album/:id/artists/:artist_id — remove a non-primary artist from an album
admin.delete('/album/:id/artists/:artist_id', async (c) => {
  const albumId = parseInt(c.req.param('id'))
  const artistId = parseInt(c.req.param('artist_id'))

  try {
    const deleted = await db
      .deleteFrom('artist_albums')
      .where('album_id', '=', albumId)
      .where('artist_id', '=', artistId)
      .where('role', '!=', 'primary')
      .returningAll()
      .executeTakeFirst()

    if (!deleted) {
      return c.json({ error: 'Relationship not found or cannot remove primary artist' }, 404)
    }
    return c.json({ success: true })
  } catch (error) {
    console.error('Error removing artist from album:', error)
    return c.json({ error: 'Failed to remove artist from album' }, 500)
  }
})

// GET /admin/artist/:id/albums — list non-primary albums for an artist
admin.get('/artist/:id/albums', async (c) => {
  const id = parseInt(c.req.param('id'))
  try {
    const rows = await db
      .selectFrom('artist_albums')
      .innerJoin('albums', 'albums.id', 'artist_albums.album_id')
      .select([
        'artist_albums.album_id',
        'artist_albums.role',
        'albums.title',
        'albums.release_year',
      ])
      .where('artist_albums.artist_id', '=', id)
      .where('artist_albums.role', '!=', 'primary')
      .orderBy('albums.release_year', 'asc')
      .execute()
    return c.json(rows)
  } catch (error) {
    console.error('Error fetching artist albums:', error)
    return c.json({ error: 'Failed to fetch artist albums' }, 500)
  }
})

// POST /admin/artist/:id/albums — add a non-primary album to an artist
admin.post('/artist/:id/albums', async (c) => {
  const artistId = parseInt(c.req.param('id'))
  const body = await c.req.json()
  const { album_id, role } = body

  if (!album_id || !role) {
    return c.json({ error: 'album_id and role are required' }, 400)
  }
  if (!['compilation', 'featured', 'guest', 'collaborator', 'composer', 'performer'].includes(role)) {
    return c.json({ error: 'Invalid role. Must be compilation, featured, guest, collaborator, composer, or performer' }, 400)
  }

  try {
    const existing = await db
      .selectFrom('artist_albums')
      .select('order')
      .where('album_id', '=', album_id)
      .execute()
    const nextOrder = existing.length > 0 ? Math.max(...existing.map(r => r.order)) + 1 : 1

    const inserted = await db
      .insertInto('artist_albums')
      .values({ artist_id: artistId, album_id, role, order: nextOrder })
      .returningAll()
      .executeTakeFirst()

    return c.json(inserted)
  } catch (error: any) {
    if (error.code === '23505') {
      return c.json({ error: 'This artist is already associated with this album' }, 409)
    }
    console.error('Error adding album to artist:', error)
    return c.json({ error: 'Failed to add album to artist' }, 500)
  }
})

// DELETE /admin/artist/:id/albums/:album_id — remove a non-primary album from an artist
admin.delete('/artist/:id/albums/:album_id', async (c) => {
  const artistId = parseInt(c.req.param('id'))
  const albumId = parseInt(c.req.param('album_id'))

  try {
    const deleted = await db
      .deleteFrom('artist_albums')
      .where('artist_id', '=', artistId)
      .where('album_id', '=', albumId)
      .where('role', '!=', 'primary')
      .returningAll()
      .executeTakeFirst()

    if (!deleted) {
      return c.json({ error: 'Relationship not found or cannot remove primary relationship' }, 404)
    }
    return c.json({ success: true })
  } catch (error) {
    console.error('Error removing album from artist:', error)
    return c.json({ error: 'Failed to remove album from artist' }, 500)
  }
})

// GET /admin/artist/:id/related — list related artists, members, member-of, and similar artists
//
// A pair can hold a 'member' relation (one-directional, manual) alongside
// an auto-imported 'similar'/'related' one (migration 043 lets these
// coexist) — when both exist for the same pair, only the 'member' fact is
// worth surfacing on this page, so similar/related entries are suppressed
// wherever a member relation exists between the two artists in EITHER
// direction. 'member_of' is synthesized here (not a real `kind` value in
// the DB) for rows where THIS artist is the related_artist_id of someone
// else's 'member' row — i.e. artists this one is a member of.
admin.get('/artist/:id/related', async (c) => {
  const id = parseInt(c.req.param('id'))
  try {
    const outgoing = await db
      .selectFrom('artist_relations')
      .innerJoin('artists', 'artists.id', 'artist_relations.related_artist_id')
      .select(['artists.id', 'artists.name', 'artist_relations.kind', 'artist_relations.source', 'artist_relations.similarity', 'artist_relations.is_hidden', 'artist_relations.force_show'])
      .where('artist_relations.artist_id', '=', id)
      .orderBy('artist_relations.similarity', 'desc')
      .orderBy('artists.name', 'asc')
      .execute()

    const memberOf = await db
      .selectFrom('artist_relations')
      .innerJoin('artists', 'artists.id', 'artist_relations.artist_id')
      .select(['artists.id', 'artists.name', 'artist_relations.source', 'artist_relations.similarity', 'artist_relations.is_hidden', 'artist_relations.force_show'])
      .where('artist_relations.related_artist_id', '=', id)
      .where('artist_relations.kind', '=', 'member')
      .orderBy('artists.name', 'asc')
      .execute()

    const memberPairIds = new Set<number>()
    for (const r of outgoing) if (r.kind === 'member') memberPairIds.add(r.id)
    for (const r of memberOf) memberPairIds.add(r.id)

    const rows = [
      ...outgoing.filter(r => r.kind === 'member' || !memberPairIds.has(r.id)),
      ...memberOf.map(r => ({ ...r, kind: 'member_of' as const })),
    ]

    return c.json(rows)
  } catch (error) {
    console.error('Error fetching related artists:', error)
    return c.json({ error: 'Failed to fetch related artists' }, 500)
  }
})

// PATCH /admin/artist/:id/related/:related_id/force-show — toggle force_show on a relation
admin.patch('/artist/:id/related/:related_id/force-show', async (c) => {
  const artistId = parseInt(c.req.param('id'))
  const relatedId = parseInt(c.req.param('related_id'))
  const body = await c.req.json()
  const forceShow: boolean = body.force_show ?? true

  try {
    await db
      .updateTable('artist_relations')
      .set({ force_show: forceShow })
      .where(eb => eb.or([
        eb.and([eb('artist_id', '=', artistId), eb('related_artist_id', '=', relatedId)]),
        eb.and([eb('artist_id', '=', relatedId), eb('related_artist_id', '=', artistId)]),
      ]))
      .execute()

    return c.json({ success: true, force_show: forceShow })
  } catch (error) {
    console.error('Error toggling force_show:', error)
    return c.json({ error: 'Failed to update relation' }, 500)
  }
})

// PATCH /admin/artist/:id/related/:related_id/hide — toggle is_hidden on a relation
admin.patch('/artist/:id/related/:related_id/hide', async (c) => {
  const artistId = parseInt(c.req.param('id'))
  const relatedId = parseInt(c.req.param('related_id'))
  const body = await c.req.json()
  const hidden: boolean = body.hidden ?? true

  try {
    // Toggle both directions so the relation is hidden symmetrically
    await db
      .updateTable('artist_relations')
      .set({ is_hidden: hidden })
      .where(eb => eb.or([
        eb.and([eb('artist_id', '=', artistId), eb('related_artist_id', '=', relatedId)]),
        eb.and([eb('artist_id', '=', relatedId), eb('related_artist_id', '=', artistId)]),
      ]))
      .execute()

    return c.json({ success: true, hidden })
  } catch (error) {
    console.error('Error toggling relation visibility:', error)
    return c.json({ error: 'Failed to update relation' }, 500)
  }
})

// POST /admin/artist/:id/related — add relation (symmetric for 'related', one-directional for 'member')
admin.post('/artist/:id/related', async (c) => {
  const artistId = parseInt(c.req.param('id'))
  const body = await c.req.json()
  const relatedId = parseInt(body.related_artist_id)
  const kind: string = body.kind ?? 'related'

  if (!relatedId || isNaN(relatedId)) {
    return c.json({ error: 'related_artist_id is required' }, 400)
  }
  if (artistId === relatedId) {
    return c.json({ error: 'An artist cannot be related to itself' }, 400)
  }

  try {
    const rows = kind === 'member'
      ? [{ artist_id: artistId, related_artist_id: relatedId, kind, source: 'manual', similarity: 1.0 }]
      : [
          { artist_id: artistId, related_artist_id: relatedId, kind, source: 'manual', similarity: 1.0 },
          { artist_id: relatedId, related_artist_id: artistId, kind, source: 'manual', similarity: 1.0 },
        ]

    await db
      .insertInto('artist_relations')
      .values(rows)
      .onConflict((oc) => oc.doNothing())
      .execute()

    return c.json({ success: true })
  } catch (error) {
    console.error('Error adding related artist:', error)
    return c.json({ error: 'Failed to add related artist' }, 500)
  }
})

// DELETE /admin/artist/:id/related/:related_id?kind=member|related|similar — remove relation
//
// `kind` is required. Migration 043 widened artist_relations' uniqueness to
// (artist_id, related_artist_id, kind), so a single pair can now hold more
// than one row simultaneously (e.g. an auto-imported 'similar' row
// alongside a manual 'member' one) — inferring which row to delete from
// the pair alone is no longer possible, and doing so previously deleted
// every kind for the pair when only one was intended (a real regression
// introduced by that migration, caught during Member Of testing).
admin.delete('/artist/:id/related/:related_id', async (c) => {
  const artistId = parseInt(c.req.param('id'))
  const relatedId = parseInt(c.req.param('related_id'))
  const kind = c.req.query('kind')

  if (kind !== 'member' && kind !== 'related' && kind !== 'similar') {
    return c.json({ error: 'kind query parameter is required (member, related, or similar)' }, 400)
  }

  try {
    if (kind === 'member') {
      // One-directional: only remove artistId → relatedId
      await db
        .deleteFrom('artist_relations')
        .where('artist_id', '=', artistId)
        .where('related_artist_id', '=', relatedId)
        .where('kind', '=', 'member')
        .execute()
    } else {
      // Symmetric: remove both directions, scoped to this kind only so a
      // coexisting relation of a different kind for the same pair survives.
      await db
        .deleteFrom('artist_relations')
        .where('kind', '=', kind)
        .where((eb) =>
          eb.or([
            eb.and([
              eb('artist_id', '=', artistId),
              eb('related_artist_id', '=', relatedId),
            ]),
            eb.and([
              eb('artist_id', '=', relatedId),
              eb('related_artist_id', '=', artistId),
            ]),
          ])
        )
        .execute()
    }

    return c.json({ success: true })
  } catch (error) {
    console.error('Error removing related artist:', error)
    return c.json({ error: 'Failed to remove related artist' }, 500)
  }
})

// --- Image management routes (shared service) ---

registerEntityImageRoutes(admin, 'album')
registerEntityImageRoutes(admin, 'artist')

export default admin

import { Hono } from 'hono'
import { db, pool } from '../../db/database.js'
import { sql } from 'kysely'
import { mergeArtistInto } from '../../services/artistMergeService.js'
import { lookupArtistMBID } from '../../services/musicbrainz.js'
import { fetchArtistImageFromFanart } from '../../services/fanart.js'
import { fetchSimilarArtists } from '../../services/lastfmSimilar.js'
import { imagesDir } from '../../config/paths.js'

export const MBID_RETRYABLE = ['unmatched', 'not_found', 'low_confidence']

const router = new Hono()

// PUT /admin/artist/:id — update an artist
router.put('/artist/:id', async (c) => {
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

    const { resolveManualMbid } = await import('../../services/mbidService.js')
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

// DELETE /admin/artist/:id — delete an artist and cascade to albums, tracks, media_files
router.delete('/artist/:id', async (c) => {
  const id = parseInt(c.req.param('id'))

  try {
    const artist = await db.selectFrom('artists').select('id').where('id', '=', id).executeTakeFirst()
    if (!artist) return c.json({ error: 'Artist not found' }, 404)

    const { deleteAlbumsCascade } = await import('../../services/entityDeleteService.js')
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
router.post('/artist', async (c) => {
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

// GET /admin/artists/search?q= — artist search including stubs (no albums required)
router.get('/artists/search', async (c) => {
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

// GET /admin/artist/:id/merge-stubs — preview which stubs would be merged
router.get('/artist/:id/merge-stubs', async (c) => {
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
router.post('/artist/:id/merge', async (c) => {
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

export default router

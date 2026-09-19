import { Hono } from 'hono'
import { db } from '../../db/database.js'
import { sql } from 'kysely'
import { SINGLES_ALBUM_TITLE } from '../../constants/singles.js'

const router = new Hono()

// GET /admin/track/:id — full admin detail for a single track
router.get('/track/:id', async (c) => {
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
router.put('/track/:id', async (c) => {
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
router.post('/track/:id/collaborators', async (c) => {
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
router.delete('/track/:id/collaborators/:collaboratorId', async (c) => {
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
router.put('/track/:id/recording-mbid', async (c) => {
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

router.post('/track/:id/make-single', async (c) => {
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
router.delete('/track/:id', async (c) => {
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

export default router

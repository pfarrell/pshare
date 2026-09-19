import { Hono } from 'hono'
import { db } from '../../db/database.js'

const router = new Hono()

// GET /admin/album/:id/artists — list non-primary artists for an album
router.get('/album/:id/artists', async (c) => {
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
router.post('/album/:id/artists', async (c) => {
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
router.delete('/album/:id/artists/:artist_id', async (c) => {
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
router.get('/artist/:id/albums', async (c) => {
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
router.post('/artist/:id/albums', async (c) => {
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
router.delete('/artist/:id/albums/:album_id', async (c) => {
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
router.get('/artist/:id/related', async (c) => {
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
router.patch('/artist/:id/related/:related_id/force-show', async (c) => {
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
router.patch('/artist/:id/related/:related_id/hide', async (c) => {
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
router.post('/artist/:id/related', async (c) => {
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
router.delete('/artist/:id/related/:related_id', async (c) => {
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

export default router

import { Hono } from 'hono'
import { sql } from 'kysely'
import { db } from '../db/database.js'
import type { Variables } from '../types.js'
import { notesService } from '../services/notesService.js'
import { createRecallNote, getRecallItem, decryptRecallToken, appendBacklink, stripBacklink } from '../services/recallService.js'
import { getCollectionSummary } from '../services/wikipedia.js'
import { streamBase } from '../db/streamUrl.js'
import { requireAuth } from '../middleware/auth.js'
import { canModify } from '../utils/ownership.js'
import { downloadToDisk, ImageStorageError } from '../services/imageStorage.js'

const collections = new Hono<{ Variables: Variables }>()

function buildAlbum(a: any) {
  return {
    id: a.id,
    title: a.title,
    image_path: a.image_path,
    release_year: a.release_year,
    artist: { id: a.artist_id, name: a.artist_name },
  }
}

// GET /collections
collections.get('/', async (c) => {
  const rows = await db.selectFrom('collections').selectAll().orderBy('name', 'asc').execute()
  if (rows.length === 0) return c.json([])

  const collectionIds = rows.map((r) => r.id)
  const albumRows = await db
    .selectFrom('collection_albums')
    .innerJoin('albums', 'albums.id', 'collection_albums.album_id')
    .select(['collection_albums.collection_id', 'albums.id as album_id', 'albums.image_path'])
    .where('collection_albums.collection_id', 'in', collectionIds)
    .where('albums.image_path', 'is not', null)
    .orderBy('collection_albums.order', 'asc')
    .execute()

  const previewsByCollection = new Map<number, { id: number; image_path: string }[]>()
  for (const row of albumRows) {
    const list = previewsByCollection.get(row.collection_id) ?? []
    if (list.length < 4) {
      list.push({ id: row.album_id, image_path: row.image_path as string })
      previewsByCollection.set(row.collection_id, list)
    }
  }

  return c.json(rows.map((r) => ({ ...r, preview_albums: previewsByCollection.get(r.id) ?? [] })))
})

// GET /collection/:id
collections.get('/:id', async (c) => {
  const id = parseInt(c.req.param('id'))
  const collection = await db.selectFrom('collections').selectAll().where('id', '=', id).executeTakeFirst()
  if (!collection) return c.json({ error: 'Not found' }, 404)

  const summary = await getCollectionSummary(collection.wikipedia)

  const caRows = await db
    .selectFrom('collection_albums')
    .select(['album_id', 'order'])
    .where('collection_id', '=', id)
    .orderBy('order', 'asc')
    .execute()

  const albumIds = caRows.map((r) => r.album_id)
  const albums = albumIds.length
    ? (await db
        .selectFrom('albums')
        .innerJoin('artists', 'artists.id', 'albums.artist_id')
        .select([
          'albums.id', 'albums.title', 'albums.image_path', 'albums.release_year',
          'artists.id as artist_id', 'artists.name as artist_name',
        ])
        .where('albums.id', 'in', albumIds)
        .execute()).map(buildAlbum)
    : []

  // Preserve order from collection_albums
  const byId = new Map(albums.map((a) => [a.id, a]))
  const orderByAlbumId = new Map(caRows.map((r) => [r.album_id, r.order]))
  const orderedAlbums = albumIds
    .map((id) => byId.get(id))
    .filter(Boolean)
    .map((album) => ({ ...album, order: orderByAlbumId.get(album!.id) ?? 0 }))

  const stubs = await db
    .selectFrom('album_stubs')
    .select(['id', 'title', 'artist_name', 'order'])
    .where('collection_id', '=', id)
    .orderBy('order', 'asc')
    .execute()

  const noteRows = await notesService.listNotesByTarget('collection', id)
  const authorTokens = new Map<number, string>()
  for (const row of noteRows) {
    if (!authorTokens.has(row.author_id)) {
      const conn = await notesService.getConnection(row.author_id)
      if (conn) {
        try {
          authorTokens.set(row.author_id, decryptRecallToken(conn.recall_token))
        } catch {
          // leave unset — this author's notes fall through to error: true below
        }
      }
    }
  }
  const notes = await Promise.all(noteRows.map(async (row) => {
    const base = { id: row.id, author: { id: row.author_id, username: row.author_username }, created_at: row.created_at }
    const token = authorTokens.get(row.author_id)
    if (!token) return { ...base, error: true as const }
    try {
      const item = await getRecallItem(token, row.recall_item_id)
      if (!item) return { ...base, error: true as const }
      return {
        ...base,
        recall_item_id: row.recall_item_id,
        title: item.title,
        content: stripBacklink(item.contentText ?? ''),
      }
    } catch {
      return { ...base, error: true as const }
    }
  }))

  return c.json({ collection, albums: orderedAlbums, stubs, notes, summary: summary ?? {} })
})

// POST /collection/:id/tracks/random — powers Shuffle Collection playback mode. Returns a
// random batch of tracks drawn from every album in the collection, shaped exactly like
// GET /album/:id's track objects so the response can be queued directly by the player.
// excludeTrackIds lets the frontend avoid re-drawing tracks it has already queued this
// session; once a collection's remaining eligible tracks run out, this simply returns fewer
// than `limit` (down to zero) rather than erroring.
collections.post('/:id/tracks/random', async (c) => {
  const collectionId = parseInt(c.req.param('id'))
  if (!Number.isInteger(collectionId)) return c.json({ error: 'Not found' }, 404)

  const collection = await db.selectFrom('collections').select('id').where('id', '=', collectionId).executeTakeFirst()
  if (!collection) return c.json({ error: 'Not found' }, 404)

  const body = await c.req.json().catch(() => ({} as any))
  const limit = Math.min(Math.max(parseInt(body.limit) || 25, 1), 100)
  const excludeTrackIds: number[] = Array.isArray(body.excludeTrackIds)
    ? body.excludeTrackIds.filter((id: any) => Number.isInteger(id))
    : []

  const rows = await sql<any>`
    SELECT t.id, t.title, t.track_number, t.duration_sec,
           al.id as album_id, al.title as album_title, al.image_path as album_image_path, al.release_year as album_release_year,
           ar.id as artist_id, ar.name as artist_name,
           track_ar.id as track_artist_id, track_ar.name as track_artist_name
    FROM collection_albums ca
    INNER JOIN albums al ON al.id = ca.album_id
    INNER JOIN artists ar ON ar.id = al.artist_id
    INNER JOIN tracks t ON t.album_id = al.id AND t.approved = true
    LEFT JOIN artists track_ar ON track_ar.id = t.artist_id
    WHERE ca.collection_id = ${collectionId}
      ${excludeTrackIds.length ? sql`AND t.id NOT IN (${sql.join(excludeTrackIds)})` : sql``}
    ORDER BY random()
    LIMIT ${limit}
  `.execute(db)

  const tracks = rows.rows.map((t: any) => ({
    id: t.id,
    title: t.title,
    track_number: t.track_number,
    duration: t.duration_sec,
    album: { id: t.album_id, title: t.album_title, release_year: t.album_release_year, artist: { id: t.artist_id, name: t.artist_name } },
    artist: { id: t.track_artist_id ?? t.artist_id, name: t.track_artist_name ?? t.artist_name },
    image_path: t.album_image_path,
    url: `${streamBase(c)}/stream/${t.id}`,
    download_url: `${streamBase(c)}/download/${t.id}`,
  }))

  return c.json({ tracks })
})

// POST /collections
collections.post('/', requireAuth, async (c) => {
  const user = c.get('user')!
  const { name } = await c.req.json()
  if (!name?.trim()) return c.json({ error: 'Name is required' }, 400)

  const result = await db
    .insertInto('collections')
    .values({ name: name.trim(), user_id: user.id, created_at: new Date(), updated_at: new Date() })
    .returningAll()
    .executeTakeFirst()

  return c.json(result, 201)
})

// PUT /collection/:id
collections.put('/:id', requireAuth, async (c) => {
  const id = parseInt(c.req.param('id'))
  const user = c.get('user')!

  const collection = await db.selectFrom('collections').selectAll().where('id', '=', id).executeTakeFirst()
  if (!collection) return c.json({ error: 'Not found' }, 404)
  if (!canModify(user, collection)) return c.json({ error: 'Not permitted' }, 403)

  const { name, image_path, wikipedia } = await c.req.json()

  await db.updateTable('collections').set({ name, image_path, wikipedia }).where('id', '=', id).execute()
  return c.json({ success: true })
})

// DELETE /collection/:id — deletes only the collection row; collection_albums and
// album_stubs rows referencing it cascade via FK (ON DELETE CASCADE), but the
// albums/artists themselves are untouched.
collections.delete('/:id', requireAuth, async (c) => {
  const id = parseInt(c.req.param('id'))
  const user = c.get('user')!

  const collection = await db.selectFrom('collections').selectAll().where('id', '=', id).executeTakeFirst()
  if (!collection) return c.json({ error: 'Not found' }, 404)
  if (!canModify(user, collection)) return c.json({ error: 'Not permitted' }, 403)

  await db.deleteFrom('collections').where('id', '=', id).execute()
  return c.json({ success: true })
})

// POST /collection/:id/albums
collections.post('/:id/albums', requireAuth, async (c) => {
  const collectionId = parseInt(c.req.param('id'))
  const user = c.get('user')!

  const collection = await db.selectFrom('collections').selectAll().where('id', '=', collectionId).executeTakeFirst()
  if (!collection) return c.json({ error: 'Not found' }, 404)
  if (!canModify(user, collection)) return c.json({ error: 'Not permitted' }, 403)

  const { album_id } = await c.req.json()

  const [maxAlbumOrder, maxStubOrder] = await Promise.all([
    db.selectFrom('collection_albums').select(db.fn.max('order').as('max_order')).where('collection_id', '=', collectionId).executeTakeFirst(),
    db.selectFrom('album_stubs').select(db.fn.max('order').as('max_order')).where('collection_id', '=', collectionId).executeTakeFirst(),
  ])
  const nextOrder = Math.max(maxAlbumOrder?.max_order ?? 0, maxStubOrder?.max_order ?? 0) + 1

  await db
    .insertInto('collection_albums')
    .values({ collection_id: collectionId, album_id, order: nextOrder })
    .onConflict((oc) => oc.columns(['collection_id', 'album_id']).doNothing())
    .execute()

  await db.updateTable('collections').set({ updated_at: new Date() }).where('id', '=', collectionId).execute()
  return c.json({ success: true })
})

// POST /collection/:id/stubs — add a placeholder for an album not yet owned
collections.post('/:id/stubs', requireAuth, async (c) => {
  const collectionId = parseInt(c.req.param('id'))
  const user = c.get('user')!

  const collection = await db.selectFrom('collections').selectAll().where('id', '=', collectionId).executeTakeFirst()
  if (!collection) return c.json({ error: 'Not found' }, 404)
  if (!canModify(user, collection)) return c.json({ error: 'Not permitted' }, 403)

  const { title, artist_name } = await c.req.json()

  if (!title || !title.trim()) {
    return c.json({ error: 'Title is required' }, 400)
  }

  const [maxAlbumOrder, maxStubOrder] = await Promise.all([
    db.selectFrom('collection_albums').select(db.fn.max('order').as('max_order')).where('collection_id', '=', collectionId).executeTakeFirst(),
    db.selectFrom('album_stubs').select(db.fn.max('order').as('max_order')).where('collection_id', '=', collectionId).executeTakeFirst(),
  ])
  const nextOrder = Math.max(maxAlbumOrder?.max_order ?? 0, maxStubOrder?.max_order ?? 0) + 1

  const stub = await db
    .insertInto('album_stubs')
    .values({
      title: title.trim(),
      artist_name: artist_name?.trim() || null,
      user_id: user.id,
      collection_id: collectionId,
      order: nextOrder,
      created_at: new Date(),
      updated_at: new Date(),
    })
    .returningAll()
    .executeTakeFirstOrThrow()

  await db.updateTable('collections').set({ updated_at: new Date() }).where('id', '=', collectionId).execute()
  return c.json({ stub })
})

// DELETE /collection/:id/stubs/:stubId
collections.delete('/:id/stubs/:stubId', requireAuth, async (c) => {
  const collectionId = parseInt(c.req.param('id'))
  const stubId = parseInt(c.req.param('stubId'))
  const user = c.get('user')!

  const collection = await db.selectFrom('collections').selectAll().where('id', '=', collectionId).executeTakeFirst()
  if (!collection) return c.json({ error: 'Not found' }, 404)
  if (!canModify(user, collection)) return c.json({ error: 'Not permitted' }, 403)

  const result = await db
    .deleteFrom('album_stubs')
    .where('id', '=', stubId)
    .where('collection_id', '=', collectionId)
    .executeTakeFirst()

  if (result.numDeletedRows === 0n) {
    return c.json({ error: 'Stub not found' }, 404)
  }

  return c.json({ success: true })
})

// POST /collection/:id/stubs/:stubId/resolve — replace a stub with a real album at the same position
collections.post('/:id/stubs/:stubId/resolve', requireAuth, async (c) => {
  const collectionId = parseInt(c.req.param('id'))
  const stubId = parseInt(c.req.param('stubId'))
  const user = c.get('user')!

  const collection = await db.selectFrom('collections').selectAll().where('id', '=', collectionId).executeTakeFirst()
  if (!collection) return c.json({ error: 'Not found' }, 404)
  if (!canModify(user, collection)) return c.json({ error: 'Not permitted' }, 403)

  const { album_id } = await c.req.json()

  const stub = await db
    .selectFrom('album_stubs')
    .selectAll()
    .where('id', '=', stubId)
    .where('collection_id', '=', collectionId)
    .executeTakeFirst()

  if (!stub) {
    return c.json({ error: 'Stub not found' }, 404)
  }

  const existing = await db
    .selectFrom('collection_albums')
    .select('id')
    .where('collection_id', '=', collectionId)
    .where('album_id', '=', album_id)
    .executeTakeFirst()

  if (existing) {
    return c.json({ error: 'This album is already in the collection' }, 409)
  }

  await db.transaction().execute(async (trx) => {
    await trx
      .insertInto('collection_albums')
      .values({ collection_id: collectionId, album_id, order: stub.order })
      .execute()
    await trx.deleteFrom('album_stubs').where('id', '=', stubId).execute()
  })

  await db.updateTable('collections').set({ updated_at: new Date() }).where('id', '=', collectionId).execute()
  return c.json({ success: true })
})

// DELETE /collection/:id/albums/:albumId
collections.delete('/:id/albums/:albumId', requireAuth, async (c) => {
  const collectionId = parseInt(c.req.param('id'))
  const albumId = parseInt(c.req.param('albumId'))
  const user = c.get('user')!

  const collection = await db.selectFrom('collections').selectAll().where('id', '=', collectionId).executeTakeFirst()
  if (!collection) return c.json({ error: 'Not found' }, 404)
  if (!canModify(user, collection)) return c.json({ error: 'Not permitted' }, 403)

  await db
    .deleteFrom('collection_albums')
    .where('collection_id', '=', collectionId)
    .where('album_id', '=', albumId)
    .execute()

  return c.json({ success: true })
})

// POST /collection/:id/notes — requires a connected Recall account; creates a new journal-style note
collections.post('/:id/notes', async (c) => {
  const user = c.get('user')
  if (!user) return c.json({ error: 'Authentication required' }, 401)

  const collectionId = parseInt(c.req.param('id'))
  const connection = await notesService.getConnection(user.id)
  if (!connection) return c.json({ error: 'Recall not connected' }, 403)

  const body = await c.req.json()
  const content = typeof body.content === 'string' ? body.content.trim() : ''
  if (!content) return c.json({ error: 'content is required' }, 400)

  const collection = await db.selectFrom('collections').selectAll().where('id', '=', collectionId).executeTakeFirst()
  if (!collection) return c.json({ error: 'Collection not found' }, 404)

  const token = decryptRecallToken(connection.recall_token)
  let item
  try {
    item = await createRecallNote(token, {
      title: `${collection.name} (collection)`,
      contentText: appendBacklink(content, `/collection/${collectionId}`),
      tags: ['bemused'],
    })
  } catch (err) {
    console.error('Failed to create Recall note:', err)
    return c.json({ error: 'Failed to save note to Recall' }, 502)
  }

  const note = await notesService.createNote('collection', collectionId, user.id, item.id)
  return c.json({ id: note.id, recall_item_id: item.id }, 201)
})

// DELETE /collection/:id/notes/:noteId — unlinks only; the Recall item itself is untouched
collections.delete('/:id/notes/:noteId', async (c) => {
  const user = c.get('user')
  if (!user) return c.json({ error: 'Authentication required' }, 401)

  const noteId = parseInt(c.req.param('noteId'))
  const note = await notesService.findNoteById(noteId)
  if (!note) return c.json({ error: 'Not found' }, 404)

  if (note.author_user_id !== user.id && !user.admin) {
    return c.json({ error: 'Not permitted' }, 403)
  }

  await notesService.deleteNote(noteId)
  return c.json({ ok: true })
})

// PATCH /collection/:id/albums/reorder
collections.patch('/:id/albums/reorder', requireAuth, async (c) => {
  const collectionId = parseInt(c.req.param('id'))
  const user = c.get('user')!

  const collection = await db.selectFrom('collections').selectAll().where('id', '=', collectionId).executeTakeFirst()
  if (!collection) return c.json({ error: 'Not found' }, 404)
  if (!canModify(user, collection)) return c.json({ error: 'Not permitted' }, 403)

  const { album_orders, stub_orders } = await c.req.json() // [{ album_id, order }], [{ stub_id, order }]

  await db.transaction().execute(async (trx) => {
    for (const { album_id, order } of album_orders || []) {
      await trx
        .updateTable('collection_albums')
        .set({ order })
        .where('collection_id', '=', collectionId)
        .where('album_id', '=', album_id)
        .execute()
    }
    for (const { stub_id, order } of stub_orders || []) {
      await trx
        .updateTable('album_stubs')
        .set({ order })
        .where('collection_id', '=', collectionId)
        .where('id', '=', stub_id)
        .execute()
    }
  })

  return c.json({ success: true })
})

// POST /collection/:id/image — download and save a collection image from a URL
collections.post('/:id/image', requireAuth, async (c) => {
  const id = parseInt(c.req.param('id'))
  const user = c.get('user')!

  const collection = await db.selectFrom('collections').selectAll().where('id', '=', id).executeTakeFirst()
  if (!collection) return c.json({ error: 'Not found' }, 404)
  if (!canModify(user, collection)) return c.json({ error: 'Not permitted' }, 403)

  const body = await c.req.json()
  const { image_url, image_name } = body

  if (!image_url || !image_name) {
    return c.json({ error: 'image_url and image_name are required' }, 400)
  }

  try {
    await downloadToDisk(image_url, image_name, 'albums')

    const updated = await db
      .updateTable('collections')
      .set({ image_path: image_name, updated_at: new Date() })
      .where('id', '=', id)
      .returningAll()
      .executeTakeFirst()

    if (!updated) return c.json({ error: 'Collection not found' }, 404)
    return c.json({ success: true, collection: updated })
  } catch (error) {
    if (error instanceof ImageStorageError) return c.json({ error: error.message }, 400)
    console.error('Error downloading/saving collection image:', error)
    return c.json({ error: 'Failed to save image' }, 500)
  }
})

export default collections

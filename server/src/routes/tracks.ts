// server/src/routes/tracks.ts
import { Hono } from 'hono'
import type { Variables } from '../types.js'
import { db } from '../db/database.js'
import { notesService } from '../services/notesService.js'
import { getRecallItem, decryptRecallToken, stripBacklink } from '../services/recallService.js'
import { requireAuth } from '../middleware/auth.js'
import { fetchTracksForIds } from './playlists.js'
import { createNotesRoutes } from './notesRoutes.js'

const tracks = new Hono<{ Variables: Variables }>()

// GET /track/:id — public track detail: title, artist/album context,
// cover art, stream/download URLs. Powers the track share page.
tracks.get('/:id', async (c) => {
  const id = parseInt(c.req.param('id'))
  if (!Number.isInteger(id)) return c.json({ error: 'Track not found' }, 404)
  const [track] = await fetchTracksForIds([id], c)
  if (!track) return c.json({ error: 'Track not found' }, 404)
  return c.json({ track })
})

// GET /track/:id/notes — gated: Recall-linked journal notes are personal
// content and shouldn't become world-readable just because the track
// itself (added in a later task) is public. Fetched on demand only
// (never embedded in bulk tracklist responses: an album/playlist
// tracklist rendering many tracks must not trigger a live Recall fetch
// per track).
tracks.get('/:id/notes', requireAuth, async (c) => {
  const id = parseInt(c.req.param('id'))

  const noteRows = await notesService.listNotesByTarget('track', id)
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

  return c.json({ notes })
})



tracks.route('/', createNotesRoutes({
  kind: 'track',
  loadEntityTitle: async (id) => {
    const track = await db
      .selectFrom('tracks')
      .leftJoin('albums', 'albums.id', 'tracks.album_id')
      .select(['tracks.title', 'albums.title as album_title'])
      .where('tracks.id', '=', id)
      .executeTakeFirst()
    if (!track) return null
    return track.album_title ? `${track.title} — ${track.album_title}` : track.title
  },
}))

export default tracks

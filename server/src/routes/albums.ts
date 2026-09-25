import { Hono } from 'hono'
import type { Variables } from '../types.js'
import { getAlbumSummary } from '../services/wikipedia.js'
import { streamBase } from '../db/streamUrl.js'
import { albumsService } from '../services/albumsService.js'
import { profilesService } from '../services/profilesService.js'
import { countsService } from '../services/countsService.js'
import { notesService } from '../services/notesService.js'
import { getRecallItem, decryptRecallToken, stripBacklink } from '../services/recallService.js'
import { requireAuth } from '../middleware/auth.js'
import { createNotesRoutes } from './notesRoutes.js'

const albums = new Hono<{ Variables: Variables }>()

// GET /albums/random?size=N&tag=slug — gated, same reasoning as
// artists.ts's /random: powers the logged-in Home feed.
albums.get('/random', requireAuth, async (c) => {
  const size = Math.min(parseInt(c.req.query('size') ?? '10'), 200)
  const profileIdParam = c.req.query('profileId')

  const rows = profileIdParam
    ? await albumsService.randomByTagIds(await profilesService.getTagIds(parseInt(profileIdParam)), size)
    : await albumsService.randomAll(size)

  const albumIds = rows.rows.map((row: any) => row.id)
  const trackCounts = await countsService.trackCountsByAlbumIds(albumIds)

  return c.json(rows.rows.map((row: any) => ({
    id: row.id,
    title: row.title,
    image_path: row.image_path,
    artist: { id: row.artist_id, name: row.artist_name },
    has_collaborators: row.has_collaborators,
    track_count: trackCounts.get(row.id) ?? 0,
  })))
})

// GET /albums/recent?size=N — gated, powers Jukebox Mode's Quick Hit panel
// (recently-played albums, most recent first). See
// docs/superpowers/specs/2026-09-20-jukebox-mode-design.md.
albums.get('/recent', requireAuth, async (c) => {
  const size = Math.min(parseInt(c.req.query('size') ?? '10'), 200)
  const profileIdParam = c.req.query('profileId')

  const tagIds = profileIdParam ? await profilesService.getTagIds(parseInt(profileIdParam)) : null
  const rows = await albumsService.recentlyPlayed(size, tagIds)
  const albumIds = rows.rows.map((row: any) => row.id)
  const trackCounts = await countsService.trackCountsByAlbumIds(albumIds)

  return c.json(rows.rows.map((row: any) => ({
    id: row.id,
    title: row.title,
    image_path: row.image_path,
    artist: { id: row.artist_id, name: row.artist_name },
    has_collaborators: row.has_collaborators,
    track_count: trackCounts.get(row.id) ?? 0,
  })))
})

// GET /album/:id
albums.get('/:id', async (c) => {
  const id = parseInt(c.req.param('id'))
  if (!Number.isInteger(id)) return c.json({ error: 'Not found' }, 404)

  const album = await albumsService.findAlbumById(id)

  if (!album) return c.json({ error: 'Not found' }, 404)

  const artist = await albumsService.findArtistById(album.artist_id)

  if (!artist) return c.json({ error: 'Artist not found' }, 404)

  // Fetch tracks with their artist info (track-level artist override)
  const trackRows = await albumsService.findTracksByAlbumId(id)

  trackRows.sort((a, b) => (parseInt(a.track_number ?? '0') || 0) - (parseInt(b.track_number ?? '0') || 0))

  const tracks = trackRows.map((t) => ({
    id: t.id,
    title: t.title,
    track_number: t.track_number,
    duration: t.duration_sec,
    album: { id: album.id, title: album.title, release_year: album.release_year, artist: { id: artist.id, name: artist.name } },
    artist: { id: t.artist_id ?? artist.id, name: t.artist_name ?? artist.name },
    image_path: album.image_path,
    url: `${streamBase(c)}/stream/${t.id}`,
    download_url: `${streamBase(c)}/download/${t.id}`,
  }))

  const secondaryArtistRows = await albumsService.findSecondaryArtistsByAlbumId(id)

  const secondary_artists = secondaryArtistRows.map(r => ({ id: r.id, name: r.name, role: r.role }))

  const collections = await albumsService.findCollectionsByAlbumId(id)

  // For various-artists albums, list every distinct artist credited on a
  // track (deduplicated, first-occurrence/track order) so the frontend can
  // show them in place of a single owning artist.
  // The "Various Artists" placeholder itself (id 161, see docs/architecture.md)
  // must never appear in this list: a track with a null artist_id falls back
  // to the album's own artist above, which for a compilation IS the
  // placeholder — surfacing it here would leak the placeholder's identity
  // into a display specifically designed to decouple from it.
  const VARIOUS_ARTISTS_ID = 161
  const compilation_artists: { id: number; name: string }[] = []
  if (album.is_compilation) {
    const seen = new Set<number>()
    for (const t of tracks) {
      if (t.artist.id === VARIOUS_ARTISTS_ID) continue
      if (!seen.has(t.artist.id)) {
        seen.add(t.artist.id)
        compilation_artists.push(t.artist)
      }
    }
  }

  const summary = await getAlbumSummary(
    artist.name,
    album.title,
    artist.wikipedia,
    album.wikipedia
  )

  // Notes are personal Recall-linked journal content and must stay
  // account-only even though this album page is now public — anonymous
  // requests get no notes at all, and (just as important) never trigger
  // the Recall API calls below, which run on other users' decrypted OAuth
  // tokens. Mirrors the equivalent guard on GET /track/:id/notes.
  const requestingUser = c.get('user')
  const noteRows = requestingUser ? await notesService.listNotesByTarget('album', id) : []
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

  return c.json({ album, artist, secondary_artists, compilation_artists, tracks, collections, notes, summary: summary ?? {} })
})

// GET /album/:id/adjacent?collection_id=N — previous/next album for prev/next
// navigation. Within collection_id's ordering when given and the album is
// actually a member of it; otherwise falls back to the artist's discography
// ordering (same as the Artist page's album grid).
albums.get('/:id/adjacent', async (c) => {
  const id = parseInt(c.req.param('id'))
  const collectionIdParam = c.req.query('collection_id')
  const collectionId = collectionIdParam ? parseInt(collectionIdParam) : null

  const album = await albumsService.findAlbumById(id)
  if (!album) return c.json({ error: 'Not found' }, 404)

  const adjacent = (collectionId ? await albumsService.findAdjacentInCollection(id, collectionId) : undefined)
    ?? await albumsService.findAdjacentInArtist(id, album.artist_id)

  const [prev, next] = await Promise.all([
    adjacent.prev_id ? albumsService.findAlbumStub(adjacent.prev_id) : undefined,
    adjacent.next_id ? albumsService.findAlbumStub(adjacent.next_id) : undefined,
  ])

  return c.json({ prev: prev ?? null, next: next ?? null })
})



albums.route('/', createNotesRoutes({
  kind: 'album',
  loadEntityTitle: async (id) => {
    const album = await albumsService.findAlbumById(id)
    if (!album) return null
    const artist = await albumsService.findArtistById(album.artist_id)
    return `${album.title} — ${artist?.name ?? 'Unknown Artist'}`
  },
}))

export default albums

import { Hono } from 'hono'
import type { Context } from 'hono'
import { db } from '../db/database.js'
import { streamBase } from '../db/streamUrl.js'
import { sql } from 'kysely'
import type { Variables } from '../types.js'
import { countsService } from '../services/countsService.js'
import { requireAuth } from '../middleware/auth.js'
import { loadOwned } from '../utils/http.js'
import { downloadToDisk, ImageStorageError } from '../services/imageStorage.js'
import { generatePlaylist } from '../services/playlistGeneratorService.js'
import { suggestPlaylistName } from '../services/playlistNameSuggesterService.js'
import { checkAndRecordGeneration, MAX_GENERATIONS_PER_WINDOW } from '../services/playlistGenerationRateLimiter.js'

const playlists = new Hono<{ Variables: Variables }>()

export const DEFAULT_GENERATE_SIZE = 20
export const MAX_GENERATE_SIZE = 30

// The prompt is re-sent on every tool-loop turn (up to 20), so its length
// multiplies input-token cost — cap it.
export const MAX_PROMPT_LENGTH = 500

export function resolvePrompt(raw: unknown): string | null {
  if (typeof raw !== 'string') return null
  const trimmed = raw.trim()
  return trimmed.length > 0 && trimmed.length <= MAX_PROMPT_LENGTH ? trimmed : null
}

export function resolveGenerateSize(raw: unknown): number {
  const requested = Number(raw)
  if (!Number.isFinite(requested) || requested <= 0) return DEFAULT_GENERATE_SIZE
  return Math.min(Math.floor(requested), MAX_GENERATE_SIZE)
}

// Caps how many tracks feed the name-suggestion prompt — cost containment,
// same reasoning as MAX_PROMPT_LENGTH above (a longer list only helps the
// model up to a point, but always costs more input tokens).
export const MAX_SUGGEST_NAME_TRACKS = 50

export function resolveTrackIdsForSuggestion(raw: unknown): number[] {
  if (!Array.isArray(raw)) return []
  return raw.filter((id): id is number => Number.isInteger(id)).slice(0, MAX_SUGGEST_NAME_TRACKS)
}

interface OtherAlbum {
  id: number
  title: string
  release_year: string | null
  image_path: string | null
  artist: { id: number | null, name: string | null }
  track_count: number
}

function buildTrack(t: any, c: Context, otherAlbums: OtherAlbum[]) {
  return {
    id: t.id,
    title: t.title,
    track_number: t.track_number,
    duration: t.duration_sec,
    album: t.album_id ? { id: t.album_id, title: t.album_title, release_year: t.album_release_year, artist: { id: t.album_artist_id, name: t.album_artist_name } } : null,
    artist: { id: t.track_artist_id ?? t.album_artist_id, name: t.track_artist_name ?? t.album_artist_name },
    image_path: t.album_image_path,
    url: `${streamBase(c)}/stream/${t.id}`,
    download_url: `${streamBase(c)}/download/${t.id}`,
    other_albums: otherAlbums,
  }
}

export async function fetchTracksForIds(trackIds: number[], c: Context) {
  if (!trackIds.length) return []
  const rows = await db
    .selectFrom('tracks')
    .leftJoin('albums', 'albums.id', 'tracks.album_id')
    .leftJoin('artists as album_artist', 'album_artist.id', 'albums.artist_id')
    .leftJoin('artists as track_artist', 'track_artist.id', 'tracks.artist_id')
    .select([
      'tracks.id', 'tracks.title', 'tracks.track_number', 'tracks.duration_sec', 'tracks.media_file_id',
      'albums.id as album_id', 'albums.title as album_title', 'albums.image_path as album_image_path', 'albums.release_year as album_release_year',
      'album_artist.id as album_artist_id', 'album_artist.name as album_artist_name',
      'track_artist.id as track_artist_id', 'track_artist.name as track_artist_name',
    ])
    .where('tracks.id', 'in', trackIds)
    .where('tracks.approved', '=', true)
    .execute()

  // "Also appears on": for every requested track that shares a media_file_id
  // with some other track (see consolidate-duplicate-media-files.ts), collect
  // that other track's album(s), excluding this track's own album (already
  // shown as the track's primary album).
  const mediaFileIds = [...new Set(rows.map(r => r.media_file_id).filter((id): id is number => id != null))]
  const otherAlbumsByTrackId = new Map<number, OtherAlbum[]>()

  if (mediaFileIds.length) {
    const siblingRows = await db
      .selectFrom('tracks')
      .innerJoin('albums', 'albums.id', 'tracks.album_id')
      .leftJoin('artists', 'artists.id', 'albums.artist_id')
      .select([
        'tracks.media_file_id',
        'albums.id as album_id',
        'albums.title as album_title',
        'albums.release_year as album_release_year',
        'albums.image_path as album_image_path',
        'artists.id as artist_id',
        'artists.name as artist_name',
      ])
      .where('tracks.media_file_id', 'in', mediaFileIds)
      .where('tracks.approved', '=', true)
      .execute()

    const albumsByMediaFileId = new Map<number, Map<number, OtherAlbum>>()
    for (const row of siblingRows) {
      if (row.media_file_id == null) continue
      const byAlbum = albumsByMediaFileId.get(row.media_file_id) ?? new Map<number, OtherAlbum>()
      byAlbum.set(row.album_id, {
        id: row.album_id,
        title: row.album_title,
        release_year: row.album_release_year,
        image_path: row.album_image_path,
        artist: { id: row.artist_id, name: row.artist_name },
        track_count: 0,
      })
      albumsByMediaFileId.set(row.media_file_id, byAlbum)
    }

    const allOtherAlbumIds = new Set<number>()
    for (const r of rows) {
      if (r.media_file_id == null) continue
      const byAlbum = albumsByMediaFileId.get(r.media_file_id)
      if (!byAlbum) continue
      for (const albumId of byAlbum.keys()) {
        if (albumId !== r.album_id) allOtherAlbumIds.add(albumId)
      }
    }
    const trackCounts = await countsService.trackCountsByAlbumIds([...allOtherAlbumIds])

    for (const r of rows) {
      if (r.media_file_id == null) {
        otherAlbumsByTrackId.set(r.id, [])
        continue
      }
      const byAlbum = albumsByMediaFileId.get(r.media_file_id)
      const others = byAlbum
        ? [...byAlbum.values()].filter(a => a.id !== r.album_id).map(a => ({ ...a, track_count: trackCounts.get(a.id) ?? 0 }))
        : []
      otherAlbumsByTrackId.set(r.id, others)
    }
  }

  const byId = new Map(rows.map((r) => [r.id, r]))
  return trackIds.map((id) => byId.get(id)).filter(Boolean).map((t) => buildTrack(t, c, otherAlbumsByTrackId.get(t.id) ?? []))
}

// GET /playlist/:id
playlists.get('/:id', async (c) => {
  const id = parseInt(c.req.param('id'))
  if (!Number.isInteger(id)) return c.json({ error: 'Not found' }, 404)
  const playlist = await db.selectFrom('playlists').selectAll().where('id', '=', id).executeTakeFirst()
  if (!playlist) return c.json({ error: 'Not found' }, 404)

  const ptRows = await db
    .selectFrom('playlist_tracks')
    .select(['track_id', 'order'])
    .where('playlist_id', '=', id)
    .orderBy('order', 'asc')
    .execute()

  const tracks = await fetchTracksForIds(ptRows.map((r) => r.track_id), c)
  return c.json({ playlist, tracks })
})

// GET /playlists — gated: the full playlist list must not become
// browsable without an account just because a single playlist (/:id,
// below) is public.
playlists.get('/', requireAuth, async (c) => {
  const rows = await db
    .selectFrom('playlists')
    .selectAll()
    .where('auto_generated', 'is', null)
    .execute()

  if (rows.length === 0) return c.json([])

  const playlistIds = rows.map((r) => r.id)
  const trackCounts = await countsService.trackCountsByPlaylistIds(playlistIds)

  // Preview album covers: first 4 *distinct* albums-with-images per playlist,
  // in track order — a playlist can have multiple tracks from the same album,
  // unlike a collection's albums, so duplicates must be filtered here.
  const albumRows = await db
    .selectFrom('playlist_tracks')
    .innerJoin('tracks', 'tracks.id', 'playlist_tracks.track_id')
    .innerJoin('albums', 'albums.id', 'tracks.album_id')
    .select(['playlist_tracks.playlist_id', 'albums.id as album_id', 'albums.image_path'])
    .where('playlist_tracks.playlist_id', 'in', playlistIds)
    .where('albums.image_path', 'is not', null)
    .orderBy('playlist_tracks.order', 'asc')
    .execute()

  const previewsByPlaylist = new Map<number, { id: number; image_path: string }[]>()
  for (const row of albumRows) {
    const list = previewsByPlaylist.get(row.playlist_id) ?? []
    if (list.length < 4 && !list.some((a) => a.id === row.album_id)) {
      list.push({ id: row.album_id, image_path: row.image_path as string })
    }
    previewsByPlaylist.set(row.playlist_id, list)
  }

  return c.json(rows.map((r) => ({
    ...r,
    track_count: trackCounts.get(r.id) ?? 0,
    preview_albums: previewsByPlaylist.get(r.id) ?? [],
  })))
})

// POST /playlists - Create a new playlist, optionally seeded with tracks
playlists.post('/', requireAuth, async (c) => {
  const user = c.get('user')!
  const { name, track_ids } = await c.req.json()

  const result = await db.transaction().execute(async (trx) => {
    const playlist = await trx
      .insertInto('playlists')
      .values({
        name,
        user_id: user.id,
        created_at: new Date(),
        updated_at: new Date(),
      })
      .returningAll()
      .executeTakeFirst()

    if (!playlist) {
      throw new Error('Failed to create playlist')
    }

    const ids = Array.isArray(track_ids)
      ? track_ids.filter((id: unknown): id is number => Number.isInteger(id)).slice(0, 1000)
      : []

    if (ids.length > 0) {
      await trx
        .insertInto('playlist_tracks')
        .values(ids.map((track_id: number, i: number) => ({
          playlist_id: playlist.id,
          track_id,
          order: i + 1,
        })))
        .execute()
    }

    return playlist
  })

  return c.json(result)
})

// GET /top  — top 20 most played tracks in the last 7 days — gated,
// same reasoning as the playlist list above.
playlists.get('/top', requireAuth, async (c) => {
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)

  const topRows = await db
    .selectFrom('logs')
    .select(['track_id', db.fn.count('id').as('count')])
    .where('created_at', '>', sevenDaysAgo)
    .where('track_id', 'is not', null)
    .groupBy('track_id')
    .orderBy('count', 'desc')
    .limit(20)
    .execute()

  const trackIds = topRows.map((r) => r.track_id as number)
  const tracks = await fetchTracksForIds(trackIds, c)

  return c.json({
    playlist: { name: 'Top 20', image_path: null },
    tracks,
  })
})

// GET /newborns?size=25  — most recently added tracks — gated.
playlists.get('/newborns', requireAuth, async (c) => {
  const size = parseInt(c.req.query('size') ?? '25')

  const recentTracks = await db
    .selectFrom('tracks')
    .select('id')
    .where('approved', '=', true)
    .orderBy('id', 'desc')
    .limit(size)
    .execute()

  const tracks = await fetchTracksForIds(recentTracks.map((r) => r.id), c)
  return c.json({
    playlist: { name: 'New Arrivals', image_path: null },
    tracks,
  })
})

// GET /surprise  — random 20-track playlist — gated.
playlists.get('/surprise', requireAuth, async (c) => {
  const randomTracks = await sql<{ id: number }>`
    SELECT id FROM tracks WHERE approved = true ORDER BY random() LIMIT 20
  `.execute(db)

  const tracks = await fetchTracksForIds(randomTracks.rows.map((r) => r.id), c)
  return c.json({
    playlist: { name: 'Surprise!', image_path: null },
    tracks,
  })
})

// POST /playlists/generate — AI-generated ephemeral playlist from a free-text
// prompt (jukebox kiosk today; see docs/superpowers/specs/2026-09-27-ai-playlist-generator-design.md).
// Every returned track is grounded in this library — never a guess.
playlists.post('/generate', requireAuth, async (c) => {
  const body = await c.req.json().catch(() => ({}))
  const prompt = resolvePrompt((body as Record<string, unknown>).prompt)
  if (!prompt) {
    return c.json({ error: `prompt is required (max ${MAX_PROMPT_LENGTH} characters)` }, 400)
  }
  const size = resolveGenerateSize((body as Record<string, unknown>).size)

  const user = c.get('user')!
  const jukeboxDeviceId = c.get('jukeboxDeviceId') ?? null

  // v1 scope is kiosk-triggered generation only (plus admins): /auth/signup
  // is public, so leaving this billed endpoint open to any account would let
  // self-registered users (or many of them) spend Anthropic credits. Checked
  // before the rate limiter so a rejected caller doesn't consume a slot.
  if (jukeboxDeviceId == null && !user.admin) {
    return c.json({ error: 'AI playlist generation is currently available from the jukebox kiosk only.' }, 403)
  }

  const { allowed } = await checkAndRecordGeneration({ userId: user.id, jukeboxDeviceId })
  if (!allowed) {
    return c.json({ error: `Limit of ${MAX_GENERATIONS_PER_WINDOW} generations per hour reached — try again later.` }, 429)
  }

  try {
    const { trackIds } = await generatePlaylist(prompt, size, c)
    const tracks = await fetchTracksForIds(trackIds, c)
    return c.json({
      playlist: { name: prompt.slice(0, 60), image_path: null },
      tracks,
    })
  } catch (err) {
    // Catches typed Anthropic API errors (and any other unexpected failure) —
    // the caller gets a generic message. Neither a normal "model found
    // nothing" result nor the service's overall timeout reaches this branch:
    // both resolve with whatever trackIds were confirmed (possibly []).
    console.error('AI playlist generation failed:', err)
    return c.json({ error: "Couldn't generate right now — try again." }, 502)
  }
})

// POST /playlists/suggest-name — AI-suggested playlist name from a list of
// track ids (jukebox kiosk's "Save Queue as Playlist" flow; plus admins).
// Same cost-containment posture as /playlists/generate: kiosk/admin gated,
// sharing its rate limiter, since both spend real AI credits.
playlists.post('/suggest-name', requireAuth, async (c) => {
  const body = await c.req.json().catch(() => ({}))
  const trackIds = resolveTrackIdsForSuggestion((body as Record<string, unknown>).track_ids)
  if (trackIds.length === 0) {
    return c.json({ error: 'track_ids is required' }, 400)
  }

  const user = c.get('user')!
  const jukeboxDeviceId = c.get('jukeboxDeviceId') ?? null

  if (jukeboxDeviceId == null && !user.admin) {
    return c.json({ error: 'Playlist name suggestions are currently available from the jukebox kiosk only.' }, 403)
  }

  const { allowed } = await checkAndRecordGeneration({ userId: user.id, jukeboxDeviceId })
  if (!allowed) {
    return c.json({ error: `Limit of ${MAX_GENERATIONS_PER_WINDOW} generations per hour reached — try again later.` }, 429)
  }

  try {
    const tracks = await fetchTracksForIds(trackIds, c)
    const descriptions = tracks.map((t) => `${t.artist?.name ?? 'Unknown Artist'} - ${t.title}`)
    const name = await suggestPlaylistName(descriptions)
    return c.json({ name })
  } catch (err) {
    console.error('Playlist name suggestion failed:', err)
    return c.json({ error: "Couldn't suggest a name right now — try again." }, 502)
  }
})

// POST /playlist/:id/tracks - Add a track to playlist
playlists.post('/:id/tracks', requireAuth, loadOwned('playlists'), async (c) => {
  const playlist = c.get('owned')!
  const playlistId = playlist.id

  const { track_id } = await c.req.json()

  // Get the max order for this playlist
  const maxOrderResult = await db
    .selectFrom('playlist_tracks')
    .select(db.fn.max('order').as('max_order'))
    .where('playlist_id', '=', playlistId)
    .executeTakeFirst()

  const nextOrder = (maxOrderResult?.max_order ?? 0) + 1

  await db
    .insertInto('playlist_tracks')
    .values({
      playlist_id: playlistId,
      track_id,
      order: nextOrder,
    })
    .execute()

  // Update the playlist's updated_at timestamp
  await db
    .updateTable('playlists')
    .set({ updated_at: new Date() })
    .where('id', '=', playlistId)
    .execute()

  return c.json({ success: true })
})

// DELETE /playlist/:playlistId/tracks/:trackId - Remove a track from playlist
playlists.delete('/:playlistId/tracks/:trackId', requireAuth, loadOwned('playlists', 'playlistId'), async (c) => {
  const playlist = c.get('owned')!
  const playlistId = playlist.id
  const trackId = parseInt(c.req.param('trackId'))

  await db
    .deleteFrom('playlist_tracks')
    .where('playlist_id', '=', playlistId)
    .where('track_id', '=', trackId)
    .execute()

  return c.json({ success: true })
})

// PATCH /playlist/:id/tracks/reorder - Update track order
playlists.patch('/:id/tracks/reorder', requireAuth, loadOwned('playlists'), async (c) => {
  const playlist = c.get('owned')!
  const playlistId = playlist.id

  const { track_orders } = await c.req.json() // Array of { track_id, order }

  // Update each track's order
  for (const { track_id, order } of track_orders) {
    await db
      .updateTable('playlist_tracks')
      .set({ order })
      .where('playlist_id', '=', playlistId)
      .where('track_id', '=', track_id)
      .execute()
  }

  return c.json({ success: true })
})

// PUT /playlist/:id - Update playlist metadata
playlists.put('/:id', requireAuth, loadOwned('playlists'), async (c) => {
  const playlist = c.get('owned')!

  const { name, image_path } = await c.req.json()

  await db
    .updateTable('playlists')
    .set({ name, image_path })
    .where('id', '=', playlist.id)
    .execute()

  return c.json({ success: true })
})

// POST /playlist/:id/image — download and save a playlist image from a URL
playlists.post('/:id/image', requireAuth, loadOwned('playlists'), async (c) => {
  const playlist = c.get('owned')!

  const body = await c.req.json()
  const { image_url, image_name } = body

  if (!image_url || !image_name) {
    return c.json({ error: 'image_url and image_name are required' }, 400)
  }

  try {
    await downloadToDisk(image_url, image_name, 'albums')

    // Update the playlist record
    const updated = await db
      .updateTable('playlists')
      .set({
        image_path: image_name,
        updated_at: new Date(),
      })
      .where('id', '=', playlist.id)
      .returningAll()
      .executeTakeFirst()

    if (!updated) {
      return c.json({ error: 'Playlist not found' }, 404)
    }

    return c.json({ success: true, playlist: updated })
  } catch (error) {
    if (error instanceof ImageStorageError) return c.json({ error: error.message }, 400)
    console.error('Error downloading/saving playlist image:', error)
    return c.json({ error: 'Failed to save image' }, 500)
  }
})

export default playlists

// server/src/routes/jukeboxPublic.ts
// Public, token-scoped surface for phone visitors reached via a kiosk's QR
// code (see docs/superpowers/specs/2026-09-25-jukebox-server-queue-design.md).
// Grants exactly two things: search, and submitting a track. Never exposes
// the events stream, the pending-queue catch-up endpoint, or profile data —
// those live on the kiosk-authenticated surface in jukeboxDevices.ts.
import { Hono } from 'hono'
import { getCookie } from 'hono/cookie'
import jwt from 'jsonwebtoken'
import { jukeboxQueueService } from '../services/jukeboxQueueService.js'
import { db } from '../db/database.js'
import { sseBroadcaster } from '../services/sseBroadcaster.js'
import { jukeboxStateService } from '../services/jukeboxStateService.js'
import { createFixedWindowLimiter } from '../utils/rateLimit.js'
import { handleSearchRequest } from './search.js'
import artists, { fetchRandomArtists } from './artists.js'
import albums, { fetchRandomAlbums } from './albums.js'
import collections from './collections.js'
import playlists, { listPlaylists, MAX_PLAYLIST_TRACKS } from './playlists.js'

const JWT_SECRET = process.env.BEMUSED_JWT_SECRET || 'default-secret-change-me'

const jukeboxPublic = new Hono()

// Valid auth cookie -> that user's id, otherwise null (never throws).
function userIdFromAuthCookie(c: any): number | null {
  const authCookie = getCookie(c, 'auth')
  if (!authCookie) return null
  try {
    const decoded = jwt.verify(authCookie, JWT_SECRET, { algorithms: ['HS256'] }) as { id: number }
    return decoded.id
  } catch {
    return null
  }
}

async function loadDeviceByToken(c: any, next: any) {
  const device = await jukeboxQueueService.findDeviceByToken(c.req.param('token'))
  if (!device) return c.json({ error: 'Not found' }, 404)
  c.set('jukeboxTokenDevice', device)
  await next()
}

// Light per-token cap on the read-only browse surface (each detail hit can
// trigger real work, and the QR link is shared widely).
export const GUEST_READS_PER_MINUTE = 120

// Same token check as loadDeviceByToken, plus a per-token read limit. The
// limiter is keyed only after the token is validated, so unknown tokens can't
// grow its map.
const readsAllowed = createFixedWindowLimiter(GUEST_READS_PER_MINUTE, 60_000)

async function loadDeviceForRead(c: any, next: any) {
  const device = await jukeboxQueueService.findDeviceByToken(c.req.param('token'))
  if (!device) return c.json({ error: 'Not found' }, 404)
  if (!readsAllowed(device.enqueue_token)) return c.json({ error: 'Too many requests, try again in a moment' }, 429)
  c.set('jukeboxTokenDevice', device)
  await next()
}

jukeboxPublic.get('/:token/search', loadDeviceForRead, handleSearchRequest)

export const MAX_GUEST_QUEUE_IDS = 500
// The limiter hard-rejects any single request whose cost exceeds the whole
// window, so the window must fit the biggest thing a guest can add in one tap:
// a max-size playlist (MAX_PLAYLIST_TRACKS), sent as 500-id chunks.
export const GUEST_TRACKS_PER_MINUTE = 1000

// Cheap abuse protection against one QR-code token spamming submissions —
// keyed by enqueue_token, one limiter instance shared by every request this
// process handles (see rateLimit.ts). Counts tracks, not requests: adding an
// album is one tap but many submissions.
const submissionsAllowed = createFixedWindowLimiter(GUEST_TRACKS_PER_MINUTE, 60_000)

jukeboxPublic.post('/:token/queue', loadDeviceByToken, async (c: any) => {
  const device = c.get('jukeboxTokenDevice')

  const body = await c.req.json()
  const trackIds: number[] = Array.isArray(body.trackIds)
    ? body.trackIds.filter((id: unknown) => Number.isInteger(id))
    : []
  if (trackIds.length === 0) return c.json({ error: 'trackIds must be a non-empty array of track ids' }, 400)
  if (trackIds.length > MAX_GUEST_QUEUE_IDS) {
    return c.json({ error: `at most ${MAX_GUEST_QUEUE_IDS} tracks per request` }, 400)
  }

  if (!submissionsAllowed(device.enqueue_token, trackIds.length)) {
    return c.json({ error: 'Too many submissions, try again in a moment' }, 429)
  }

  // A logged-in submitter is attributed by their account, ignoring any name
  // in the body — matches the spec's "if the request carries a valid auth
  // cookie, submitted_by_user_id is set from it (ignoring name)". An invalid
  // or expired cookie falls through and is treated as a guest submission.
  const userId = userIdFromAuthCookie(c)

  const name = typeof body.name === 'string' ? body.name.trim().slice(0, 50) : ''
  if (!userId && !name) return c.json({ error: 'name is required' }, 400)

  const submissions = await Promise.all(
    trackIds.map((trackId) => jukeboxQueueService.submit(device.id, trackId, userId ? { userId } : { name }))
  )

  submissions.forEach((submission) => sseBroadcaster.broadcastQueueItemAdded(device.id, submission))

  return c.json(submissions, 201)
})

// --- Read-only browse surface -------------------------------------------
// Detail views reuse the real (already public) routes by dispatching to them
// internally, then run the result through an allowlist. Deliberately NO
// cookie/headers are forwarded: authMiddleware is mounted globally in
// index.ts, not inside these sub-apps, so the reused handlers see no user and
// therefore never attach notes or make Recall calls.
async function readThrough(app: { request: (path: string) => Response | Promise<Response> }, path: string) {
  const res = await app.request(path)
  if (!res.ok) return null
  return res.json()
}

const parseId = (raw: string): number | null => {
  const id = Number(raw)
  return Number.isInteger(id) && id > 0 && id <= 2147483647 ? id : null
}

const pickPerson = (p: any) => (p?.id != null ? { id: p.id, name: p.name ?? '' } : null)

const pickAlbum = (a: any) => ({
  id: a.id,
  title: a.title ?? '',
  release_year: a.release_year ?? null,
  image_path: a.image_path ?? null,
  artist: pickPerson(a.artist),
  track_count: a.track_count ?? 0,
})

const pickTrack = (t: any) => ({
  id: t.id,
  title: t.title ?? '',
  duration: t.duration ?? null,
  track_number: t.track_number ?? null,
  artist: pickPerson(t.artist),
  album: t.album?.id != null ? { id: t.album.id, title: t.album.title ?? '' } : null,
})

const HOME_SIZE = 30

jukeboxPublic.get('/:token/home', loadDeviceForRead, async (c: any) => {
  if (c.req.query('mode') === 'albums') {
    const rows = await fetchRandomAlbums(HOME_SIZE, null)
    return c.json(rows.map((a: any) => ({
      id: a.id,
      title: a.title ?? '',
      image_path: a.image_path ?? null,
      artist: pickPerson(a.artist),
      track_count: a.track_count ?? 0,
    })))
  }
  const rows = await fetchRandomArtists(HOME_SIZE, null)
  return c.json(rows.map((a: any) => ({
    id: a.id,
    name: a.name ?? '',
    image_path: a.image_path ?? null,
    album_count: a.album_count ?? 0,
  })))
})

jukeboxPublic.get('/:token/artist/:id', loadDeviceForRead, async (c: any) => {
  const id = parseId(c.req.param('id'))
  const data = id ? await readThrough(artists, `/${id}`) : null
  if (!data) return c.json({ error: 'Not found' }, 404)
  return c.json({
    artist: { id: data.artist.id, name: data.artist.name ?? '', image_path: data.artist.image_path ?? null },
    albums: (data.albums ?? []).map(pickAlbum),
    singles: (data.singles ?? []).map(pickTrack),
  })
})

jukeboxPublic.get('/:token/album/:id', loadDeviceForRead, async (c: any) => {
  const id = parseId(c.req.param('id'))
  const data = id ? await readThrough(albums, `/${id}`) : null
  if (!data) return c.json({ error: 'Not found' }, 404)
  return c.json({
    album: {
      id: data.album.id,
      title: data.album.title ?? '',
      release_year: data.album.release_year ?? null,
      image_path: data.album.image_path ?? null,
    },
    artist: pickPerson(data.artist),
    tracks: (data.tracks ?? []).map(pickTrack),
  })
})

jukeboxPublic.get('/:token/playlist/:id', loadDeviceForRead, async (c: any) => {
  const id = parseId(c.req.param('id'))
  const data = id ? await readThrough(playlists, `/${id}`) : null
  if (!data) return c.json({ error: 'Not found' }, 404)
  return c.json({
    playlist: { id: data.playlist.id, name: data.playlist.name ?? '', image_path: data.playlist.image_path ?? null },
    tracks: (data.tracks ?? []).map(pickTrack),
  })
})

jukeboxPublic.get('/:token/collection/:id', loadDeviceForRead, async (c: any) => {
  const id = parseId(c.req.param('id'))
  const data = id ? await readThrough(collections, `/${id}`) : null
  if (!data) return c.json({ error: 'Not found' }, 404)
  return c.json({
    collection: { id: data.collection.id, name: data.collection.name ?? '', image_path: data.collection.image_path ?? null },
    albums: (data.albums ?? []).map(pickAlbum),
  })
})

const pickPreview = (p: any) => ({ id: p.id, image_path: p.image_path })

jukeboxPublic.get('/:token/playlists', loadDeviceForRead, async (c: any) => {
  const rows = await listPlaylists()
  return c.json(rows.map((r: any) => ({
    id: r.id,
    name: r.name ?? '',
    image_path: r.image_path ?? null,
    track_count: r.track_count ?? 0,
    preview_albums: (r.preview_albums ?? []).map(pickPreview),
  })))
})

jukeboxPublic.get('/:token/collections', loadDeviceForRead, async (c: any) => {
  const rows = (await readThrough(collections, '/')) ?? []
  return c.json(rows.map((r: any) => ({
    id: r.id,
    name: r.name ?? '',
    image_path: r.image_path ?? null,
    preview_albums: (r.preview_albums ?? []).map(pickPreview),
  })))
})

export const MAX_GUEST_TRACKS = MAX_PLAYLIST_TRACKS
export const GUEST_RANDOM_TRACKS = 25

const trackNo = (n: string | null) => parseInt(n ?? '0') || 0

// Albums and playlists are bounded, so they enqueue whole. Artists and
// collections are not (a collection can hold 140+ albums): see random-tracks.
async function trackIdsFor(kind: string, id: number): Promise<number[] | null> {
  if (kind === 'album') {
    const album = await db.selectFrom('albums').select('id').where('id', '=', id).executeTakeFirst()
    if (!album) return null
    const rows = await db.selectFrom('tracks').select(['id', 'track_number'])
      .where('album_id', '=', id).where('approved', '=', true).execute()
    return rows.sort((a, b) => trackNo(a.track_number) - trackNo(b.track_number)).map((r) => r.id)
  }

  if (kind === 'playlist') {
    const playlist = await db.selectFrom('playlists').select('id').where('id', '=', id).executeTakeFirst()
    if (!playlist) return null
    const rows = await db.selectFrom('playlist_tracks')
      .innerJoin('tracks', 'tracks.id', 'playlist_tracks.track_id')
      .select('tracks.id')
      .where('playlist_tracks.playlist_id', '=', id)
      .where('tracks.approved', '=', true)
      .orderBy('playlist_tracks.order', 'asc')
      .execute()
    return rows.map((r) => r.id)
  }

  return null
}

jukeboxPublic.get('/:token/:kind/:id/track-ids', loadDeviceForRead, async (c: any) => {
  const id = parseId(c.req.param('id'))
  const ids = id ? await trackIdsFor(c.req.param('kind'), id) : null
  if (!ids) return c.json({ error: 'Not found' }, 404)
  return c.json({ trackIds: ids.slice(0, MAX_GUEST_TRACKS) })
})

// Same "Shuffle" pattern the kiosk uses: a random batch, not the whole scope.
// Reuses the public POST /artist|collection/:id/tracks/random routes by
// internal dispatch (no cookie forwarded), which already restrict to approved
// tracks and the artist's own discography / the collection's albums.
jukeboxPublic.post('/:token/:kind/:id/random-tracks', loadDeviceForRead, async (c: any) => {
  const kind = c.req.param('kind')
  const router = kind === 'artist' ? artists : kind === 'collection' ? collections : null
  const id = parseId(c.req.param('id'))
  if (!router || !id) return c.json({ error: 'Not found' }, 404)

  const res = await router.request(`/${id}/tracks/random`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ limit: GUEST_RANDOM_TRACKS }),
  })
  if (!res.ok) return c.json({ error: 'Not found' }, 404)

  const { tracks } = await res.json()
  return c.json({ trackIds: (tracks ?? []).map((t: any) => t.id) })
})

// --- Phone queue ---------------------------------------------------------
// Phones poll the queue every few seconds while the Queue page is open, so it
// gets its own generous per-token limit, kept apart from the browse read limit.
export const GUEST_QUEUE_POLLS_PER_MINUTE = 600
const queuePollsAllowed = createFixedWindowLimiter(GUEST_QUEUE_POLLS_PER_MINUTE, 60_000)

async function loadDeviceForQueue(c: any, next: any) {
  const device = await jukeboxQueueService.findDeviceByToken(c.req.param('token'))
  if (!device) return c.json({ error: 'Not found' }, 404)
  if (!queuePollsAllowed(device.enqueue_token)) return c.json({ error: 'Too many requests, try again in a moment' }, 429)
  c.set('jukeboxTokenDevice', device)
  await next()
}

// What the kiosk has queued, for the phone's Queue page. Public like the rest of
// browsing (the queue is visible to anyone with the QR link); only skipping and
// removing need a login. Only the kiosk's own snapshot is ever returned, and an
// empty queue when nothing is listening, so a stale list never shows.
jukeboxPublic.get('/:token/queue', loadDeviceForQueue, async (c: any) => {
  const device = c.get('jukeboxTokenDevice')
  if (sseBroadcaster.commandListenerCount(device.id) === 0) {
    return c.json({ connected: false, queue: [], currentIndex: -1, isPlaying: false, playbackMode: 'off' })
  }
  const state = jukeboxStateService.get(device.id) ?? { queue: [], currentIndex: -1, isPlaying: false, playbackMode: 'off' }
  return c.json({ connected: true, ...state })
})

// --- Remote control ------------------------------------------------------
// A logged-in user (valid auth cookie) can drive the kiosk's transport. Guests
// cannot: the cookie is required, unlike the queue endpoint. No seeking, and
// no play state comes back: "toggle" is deliberately a blind toggle. jump and
// remove address a queue row (see GET /:token/queue).
export const GUEST_COMMANDS_PER_MINUTE = 30
const PLAYBACK_COMMANDS = ['toggle', 'next', 'prev', 'jump', 'remove']
const INDEXED_COMMANDS = ['jump', 'remove']
const commandsAllowed = createFixedWindowLimiter(GUEST_COMMANDS_PER_MINUTE, 60_000)

jukeboxPublic.post('/:token/command', loadDeviceByToken, async (c: any) => {
  const device = c.get('jukeboxTokenDevice')

  if (userIdFromAuthCookie(c) === null) return c.json({ error: 'Log in to control the jukebox' }, 401)

  const body = await c.req.json().catch(() => null)
  const command = body?.command
  if (typeof command !== 'string' || !PLAYBACK_COMMANDS.includes(command)) {
    return c.json({ error: `command must be one of ${PLAYBACK_COMMANDS.join(', ')}` }, 400)
  }

  // jump/remove address a queue row: the kiosk checks that row still holds
  // trackId before acting, so a stale phone view can never hit the wrong track.
  let payload: { command: string; index?: number; trackId?: number } = { command }
  if (INDEXED_COMMANDS.includes(command)) {
    const { index, trackId } = body
    if (!Number.isInteger(index) || index < 0 || !Number.isInteger(trackId)) {
      return c.json({ error: 'index (non-negative integer) and trackId (integer) are required' }, 400)
    }
    payload = { command, index, trackId }
  }

  if (!commandsAllowed(device.enqueue_token)) {
    return c.json({ error: 'Too many commands, try again in a moment' }, 429)
  }

  if (sseBroadcaster.broadcastPlaybackCommand(device.id, payload) === 0) {
    return c.json({ error: 'The jukebox is not connected' }, 409)
  }

  return c.json({ ok: true })
})

export default jukeboxPublic

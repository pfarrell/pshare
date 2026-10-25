// Spotify catalog helpers for in-app playback (experimental, #72).
import { Hono } from 'hono'
import type { Context } from 'hono'
import {
  getSpotifyAlbumTracks, findSpotifyArtistByName, getSpotifyArtist, getSpotifyArtistAlbums, isSpotifyConfigured,
  SpotifyApiError, SpotifyRateLimitError,
} from '../services/spotify.js'
import type { SpotifyArtistAlbum } from '../services/spotify.js'
import {
  createSpotifyArtistAlbumsCache, SPOTIFY_ARTIST_ALBUMS_TTL_MS, SPOTIFY_ARTIST_ALBUMS_MAX_ENTRIES,
} from '../services/spotifyArtistAlbumsCache.js'
import { spotifyLibraryMatcher } from '../services/spotifyLibraryMatch.js'
import { db } from '../db/database.js'
import { parseIntParam } from '../utils/http.js'
import { extractIpAddress } from '../utils/requestIp.js'
import { parseSpotifyPlay, spotifyPlays } from '../services/spotifyPlays.js'
import type { Variables } from '../types.js'

const spotify = new Hono<{ Variables: Variables }>()

const SPOTIFY_ID = /^[A-Za-z0-9]{1,64}$/

// GET /spotify/albums/:id/tracks — every track of a Spotify album (all pages),
// for enqueueing a whole album. Unconfigured is a normal 200, like /search/spotify.
spotify.get('/albums/:id/tracks', async (c) => {
  const id = c.req.param('id')
  if (!SPOTIFY_ID.test(id)) return c.json({ error: 'Invalid album id' }, 400)
  if (!isSpotifyConfigured()) return c.json({ configured: false, album: null, tracks: [] })

  try {
    const { album, tracks } = await getSpotifyAlbumTracks(id)
    return c.json({ configured: true, album, tracks })
  } catch (err) {
    if (err instanceof SpotifyApiError && err.status === 404) return c.json({ error: 'Spotify album not found' }, 404)
    return upstreamFailure(c, err, 'Spotify album tracks failed')
  }
})

function upstreamFailure(c: Context, err: unknown, label: string) {
  if (err instanceof SpotifyRateLimitError) {
    if (err.retryAfter !== null) c.header('Retry-After', String(err.retryAfter))
    return c.json({ error: 'Spotify rate limit exceeded', retryAfter: err.retryAfter }, 429)
  }
  console.error(`${label}:`, err)
  return c.json({ error: label }, 502)
}

// Exported as an object so tests can stub the lookup without a database.
export const localArtistLookup = {
  async findName(id: number): Promise<string | null> {
    const row = await db.selectFrom('artists').select('name').where('id', '=', id).executeTakeFirst()
    return row ? row.name ?? '' : null
  },
}

let artistAlbumsCache = createSpotifyArtistAlbumsCache({
  ttlMs: SPOTIFY_ARTIST_ALBUMS_TTL_MS,
  maxEntries: SPOTIFY_ARTIST_ALBUMS_MAX_ENTRIES,
})
export function resetSpotifyArtistAlbumsCache() {
  artistAlbumsCache = createSpotifyArtistAlbumsCache({
    ttlMs: SPOTIFY_ARTIST_ALBUMS_TTL_MS,
    maxEntries: SPOTIFY_ARTIST_ALBUMS_MAX_ENTRIES,
  })
}

// GET /spotify/artists/:localArtistId/albums — the artist's Spotify albums the
// library doesn't own, for the artist page grid. The Spotify list is cached
// per artist; library matching re-runs every time so a fresh upload hides at once.
spotify.get('/artists/:localArtistId/albums', async (c) => {
  const localArtistId = parseIntParam(c.req.param('localArtistId'))
  if (localArtistId === null) return c.json({ error: 'Invalid artist id' }, 400)
  const name = await localArtistLookup.findName(localArtistId)
  if (name === null) return c.json({ error: 'Artist not found' }, 404)
  if (!isSpotifyConfigured()) return c.json({ configured: false, spotifyArtist: null, albums: [] })

  let entry = artistAlbumsCache.get(localArtistId)
  if (!entry) {
    try {
      const spotifyArtist = await findSpotifyArtistByName(name)
      const albums = spotifyArtist ? await getSpotifyArtistAlbums(spotifyArtist.id) : []
      entry = { spotifyArtist, albums }
      artistAlbumsCache.set(localArtistId, entry)
    } catch (err) {
      return upstreamFailure(c, err, 'Spotify artist albums failed')
    }
  }

  const albums = (await withLocalIds(entry.albums)).filter((a) => a.localId === null)
  return c.json({ configured: true, spotifyArtist: entry.spotifyArtist, albums })
})

// Library matching re-runs on every request (never cached) so a fresh upload
// shows as owned at once; a failed lookup degrades to "nothing owned".
async function withLocalIds(albums: SpotifyArtistAlbum[]) {
  try {
    const annotated = await spotifyLibraryMatcher.annotate({ tracks: [], artists: [], albums })
    const localIds = new Map(annotated.albums.map((a) => [a.id, a.localId]))
    return albums.map((a) => ({ ...a, localId: localIds.get(a.id) ?? null }))
  } catch (err) {
    console.error('Spotify artist albums library match failed:', err)
    return albums.map((a) => ({ ...a, localId: null as number | null }))
  }
}

// GET /spotify/catalog/artists/:spotifyId/albums — a Spotify artist's albums
// for the in-app Spotify artist view (search result tap). Unlike the local
// artist route, owned albums stay in, carrying their localId, so the view
// shows library and Spotify albums together.
spotify.get('/catalog/artists/:spotifyId/albums', async (c) => {
  const spotifyId = c.req.param('spotifyId')
  if (!SPOTIFY_ID.test(spotifyId)) return c.json({ error: 'Invalid artist id' }, 400)
  if (!isSpotifyConfigured()) return c.json({ configured: false, spotifyArtist: null, albums: [] })

  let entry = artistAlbumsCache.get(spotifyId)
  if (!entry) {
    try {
      const artist = await getSpotifyArtist(spotifyId)
      if (!artist) return c.json({ error: 'Spotify artist not found' }, 404)
      const albums = await getSpotifyArtistAlbums(artist.id)
      entry = {
        spotifyArtist: { id: artist.id, name: artist.name, imageUrl: artist.imageUrl, externalUrl: artist.externalUrl },
        albums,
      }
      artistAlbumsCache.set(spotifyId, entry)
    } catch (err) {
      return upstreamFailure(c, err, 'Spotify artist albums failed')
    }
  }

  return c.json({ configured: true, spotifyArtist: entry.spotifyArtist, albums: await withLocalIds(entry.albums) })
})

// POST /spotify/plays — a Spotify track played past the 5-second mark (the
// local equivalent is GET /log/:id). Fire-and-forget from the player: a bad
// body is a 400, a failed insert a 500, neither ever retried.
spotify.post('/plays', async (c) => {
  const play = parseSpotifyPlay(await c.req.json().catch(() => null))
  if (!play) return c.json({ error: 'Invalid play' }, 400)
  try {
    await spotifyPlays.record(play, { userId: c.get('user')?.id ?? null, ipAddress: extractIpAddress(c) })
  } catch (err) {
    console.error('Spotify play log failed:', err)
    return c.json({ error: 'Spotify play log failed' }, 500)
  }
  return c.body(null, 204)
})

// GET /spotify/plays/recent-albums?size=N — recently played Spotify albums,
// newest first, for Jukebox Mode's Recent drawer (mixed in with /albums/recent).
spotify.get('/plays/recent-albums', async (c) => {
  const size = Math.min(parseIntParam(c.req.query('size')) ?? 20, 200)
  return c.json(await spotifyPlays.recentAlbums(size))
})

export default spotify

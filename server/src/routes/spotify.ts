// Spotify catalog helpers for in-app playback (experimental, #72).
import { Hono } from 'hono'
import type { Context } from 'hono'
import {
  getSpotifyAlbumTracks, findSpotifyArtistByName, getSpotifyArtistAlbums, isSpotifyConfigured,
  SpotifyApiError, SpotifyRateLimitError,
} from '../services/spotify.js'
import {
  createSpotifyArtistAlbumsCache, SPOTIFY_ARTIST_ALBUMS_TTL_MS, SPOTIFY_ARTIST_ALBUMS_MAX_ENTRIES,
} from '../services/spotifyArtistAlbumsCache.js'
import { spotifyLibraryMatcher } from '../services/spotifyLibraryMatch.js'
import { db } from '../db/database.js'
import { parseIntParam } from '../utils/http.js'

const spotify = new Hono()

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

  let albums = entry.albums.map((a) => ({ ...a, localId: null as number | null }))
  try {
    const annotated = await spotifyLibraryMatcher.annotate({ tracks: [], artists: [], albums: entry.albums })
    const owned = new Set(annotated.albums.filter((a) => a.localId !== null).map((a) => a.id))
    albums = albums.filter((a) => !owned.has(a.id))
  } catch (err) {
    console.error('Spotify artist albums library match failed:', err)
  }
  return c.json({ configured: true, spotifyArtist: entry.spotifyArtist, albums })
})

export default spotify

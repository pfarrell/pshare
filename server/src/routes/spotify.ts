// Spotify catalog helpers for in-app playback (experimental, #72).
import { Hono } from 'hono'
import type { Context } from 'hono'
import {
  getSpotifyAlbumTracks, findSpotifyArtistByName, getSpotifyArtist, getSpotifyArtistAlbums, isSpotifyConfigured,
  hasSpotifySinglesOrCompilations, getSpotifyGuestTracks, searchSpotifyAlbums,
  SpotifyApiError, SpotifyRateLimitError,
} from '../services/spotify.js'
import type { SpotifyArtistAlbum, SpotifyTrack } from '../services/spotify.js'
import {
  createSpotifyArtistAlbumsCache, SPOTIFY_ARTIST_ALBUMS_TTL_MS, SPOTIFY_ARTIST_ALBUMS_MAX_ENTRIES,
} from '../services/spotifyArtistAlbumsCache.js'
import { spotifyLibraryMatcher, normalizeForMatch } from '../services/spotifyLibraryMatch.js'
import { candidateMatchesAlbum, matchAlbumFill, preferredCandidates, titleKey } from '../services/spotifyAlbumFill.js'
import type { FillCandidate, LibraryAlbumForFill } from '../services/spotifyAlbumFill.js'
import { db } from '../db/database.js'
import { searchService } from '../services/searchService.js'
import { parseIntParam } from '../utils/http.js'
import { getAlbumSummary, getArtistSummary, withDeadline } from '../services/wikipedia.js'
import { extractIpAddress } from '../utils/requestIp.js'
import { parseSpotifyPlay, spotifyPlays } from '../services/spotifyPlays.js'
import type { Variables } from '../types.js'

const spotify = new Hono<{ Variables: Variables }>()

const SPOTIFY_ID = /^[A-Za-z0-9]{1,64}$/

// The Spotify pages wait a little longer than library pages (1s) for a first
// Wikipedia lookup: there's no admin override to fall back on, and the lookup
// keeps running past the deadline and caches either way.
const SUMMARY_DEADLINE_MS = 2500

// Spotify titles carry edition suffixes Wikipedia articles don't:
// "Abbey Road (Remastered 2019)" is handled by the summary service's paren
// stripping; this drops "- 2011 Remaster" style tails and "Deluxe: …" ones.
export function wikiAlbumTitle(name: string): string {
  const trimmed = name
    .replace(/\s+-\s+.*\b(remaster(ed)?|deluxe|edition|version|anniversary|expanded|mono|stereo)\b.*$/i, '')
    .replace(/\s+deluxe\b.*$/i, '')
    .trim()
  return trimmed || name
}

// The library artist matching a Spotify artist list (first match wins), or
// null. Uses the same "has playable tracks" rule as search.
async function localArtistIdFor(artists: { id: string; name: string }[]): Promise<number | null> {
  if (artists.length === 0) return null
  try {
    const annotated = await spotifyLibraryMatcher.annotate({
      tracks: [], albums: [],
      artists: artists.map((a) => ({ uri: '', id: a.id, name: a.name, imageUrl: null, externalUrl: null })),
    })
    return annotated.artists.find((a) => a.localId !== null)?.localId ?? null
  } catch (err) {
    console.error('Spotify album artist match failed:', err)
    return null
  }
}

// A library copy more than this far from Spotify's length is a different
// recording (live, edit, extended), not the same song.
const OWNED_TRACK_MAX_LENGTH_DIFF_SEC = 20

// The user's own copies of a Spotify album's tracks, keyed by Spotify track id:
// same title and artist as library search's ownership rule (approved tracks
// only), and a similar length when both are known. {} on any failure.
async function ownedLibraryTracks(tracks: SpotifyTrack[], c: Context): Promise<Record<string, unknown>> {
  try {
    const annotated = await spotifyLibraryMatcher.annotate({ tracks, albums: [], artists: [] })
    const owned = annotated.tracks.filter((t) => t.localId !== null)
    if (owned.length === 0) return {}
    const library = await searchService.fetchTracksByIds(owned.map((t) => t.localId as number), c)
    const byId = new Map(library.map((t) => [t.id, t]))
    const result: Record<string, unknown> = {}
    for (const t of owned) {
      const mine = byId.get(t.localId as number)
      if (!mine) continue
      const libSec = typeof mine.duration === 'number' ? mine.duration : null
      if (libSec !== null && t.durationMs > 0 && Math.abs(libSec - t.durationMs / 1000) > OWNED_TRACK_MAX_LENGTH_DIFF_SEC) continue
      result[t.id] = mine
    }
    return result
  } catch (err) {
    console.error('Spotify album owned-track match failed:', err)
    return {}
  }
}

// GET /spotify/albums/:id/tracks — every track of a Spotify album (all pages),
// for enqueueing a whole album. Unconfigured is a normal 200, like /search/spotify.
// ?details=1 (the Spotify album page) adds a Wikipedia `summary` and the
// library artist's `localArtistId`, plus `libraryTracks` (the user's own copies
// of its tracks, by Spotify track id, played in their place); enqueue callers
// skip all three.
spotify.get('/albums/:id/tracks', async (c) => {
  const id = c.req.param('id')
  if (!SPOTIFY_ID.test(id)) return c.json({ error: 'Invalid album id' }, 400)
  if (!isSpotifyConfigured()) return c.json({ configured: false, album: null, tracks: [] })

  try {
    const { album, tracks } = await getSpotifyAlbumTracks(id)
    if (c.req.query('details') !== '1') return c.json({ configured: true, album, tracks })
    const primary = album.artists[0]?.name ?? ''
    const [summary, localArtistId, libraryTracks] = await Promise.all([
      primary && album.name
        ? withDeadline(getAlbumSummary(primary, wikiAlbumTitle(album.name)), SUMMARY_DEADLINE_MS)
        : Promise.resolve(null),
      localArtistIdFor(album.artists),
      ownedLibraryTracks(tracks, c),
    ])
    return c.json({ configured: true, album, tracks, summary, localArtistId, libraryTracks })
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
// library doesn't own, for the artist page grid. hasOwnReleases: false means
// Spotify lists nothing of theirs (some artists have pulled their catalogue);
// guestTracks are then the tracks they appear on in other artists' releases.
// The Spotify list is cached per artist; library matching re-runs every time
// so a fresh upload hides at once.
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
      // No albums: check for singles/compilations before calling the artist
      // "not on Spotify", and only then pay for the guest-track lookup.
      const hasOwnReleases = !spotifyArtist ? null
        : albums.length > 0 || await hasSpotifySinglesOrCompilations(spotifyArtist.id)
      const guestTracks = spotifyArtist && hasOwnReleases === false ? await getSpotifyGuestTracks(spotifyArtist.id) : []
      entry = { spotifyArtist, albums, hasOwnReleases, guestTracks }
      artistAlbumsCache.set(localArtistId, entry)
    } catch (err) {
      return upstreamFailure(c, err, 'Spotify artist albums failed')
    }
  }

  const albums = (await withLocalIds(entry.albums)).filter((a) => a.localId === null)
  return c.json({
    configured: true, spotifyArtist: entry.spotifyArtist, albums,
    hasOwnReleases: entry.hasOwnReleases ?? null, guestTracks: entry.guestTracks ?? [],
  })
})

// The library album a fill is matched against: its title, year, disc, artist
// name and every track with its album_id (what GET /album/:id lists). An object
// so route tests can stub it without a database.
export const libraryAlbumLookup = {
  async find(id: number): Promise<LibraryAlbumForFill | null> {
    const album = await db.selectFrom('albums')
      .leftJoin('artists', 'artists.id', 'albums.artist_id')
      .select(['albums.title', 'albums.release_year', 'albums.disc_number', 'artists.name as artist_name'])
      .where('albums.id', '=', id)
      .executeTakeFirst()
    if (!album) return null
    const tracks = await db.selectFrom('tracks').select(['id', 'title', 'track_number']).where('album_id', '=', id).execute()
    return {
      title: album.title ?? '',
      artistName: album.artist_name ?? '',
      releaseYear: album.release_year ?? null,
      discNumber: album.disc_number ?? null,
      tracks: tracks.map((t) => ({ id: t.id, title: t.title ?? '', trackNumber: t.track_number ?? null })),
    }
  },
}

// Search results opened per album: each costs one Spotify call.
const MAX_FILL_CANDIDATES = 5
// After a failed lookup, revisits get "no fill" without calling Spotify for this
// long (or Spotify's Retry-After, if longer).
const FILL_FAILURE_TTL_MS = 5 * 60 * 1000

const newFillCache = () => createSpotifyArtistAlbumsCache<FillCandidate[]>({
  ttlMs: SPOTIFY_ARTIST_ALBUMS_TTL_MS,
  maxEntries: SPOTIFY_ARTIST_ALBUMS_MAX_ENTRIES,
})
let albumFillCache = newFillCache()
const fillFailedUntil = new Map<string, number>()
const fillInFlight = new Map<string, Promise<FillCandidate[]>>()
export function resetAlbumFillCache() {
  albumFillCache = newFillCache()
  fillFailedUntil.clear()
  fillInFlight.clear()
}

// What the Spotify side depends on, so a renamed album looks again.
const fillCacheKey = (albumId: number, library: LibraryAlbumForFill) =>
  [albumId, titleKey(library.title), normalizeForMatch(library.artistName), (library.releaseYear ?? '').slice(0, 4)].join('|')

// The candidates worth matching against: search, keep same title/artist
// (exact title, then same year, first), then open at most MAX_FILL_CANDIDATES. Any failed fetch
// fails the whole lookup: a missing candidate might have disagreed.
async function findFillCandidates(library: LibraryAlbumForFill): Promise<FillCandidate[]> {
  const found = await searchSpotifyAlbums(library.title, library.artistName)
  const matching = found.filter((album) => candidateMatchesAlbum(library, album))
  const opened = await Promise.allSettled(preferredCandidates(library, matching, (a) => a)
    .slice(0, MAX_FILL_CANDIDATES)
    .map(async (album) => ({ album, tracks: (await getSpotifyAlbumTracks(album.id)).tracks })))
  const failed = opened.find((r): r is PromiseRejectedResult => r.status === 'rejected')
  if (failed) throw failed.reason
  return opened.map((r) => (r as PromiseFulfilledResult<FillCandidate>).value)
}

// GET /spotify/library-albums/:albumId/fill — the Spotify tracks that fill a
// library album's missing positions, when one Spotify release confidently
// matches it (services/spotifyAlbumFill.ts), else spotifyAlbum: null. Only the
// Spotify candidates are cached (by album and its title/artist/year);
// the match re-runs against the current library tracks every time, so a fresh
// upload takes its slot at once. Concurrent requests share one lookup.
spotify.get('/library-albums/:albumId/fill', async (c) => {
  const albumId = parseIntParam(c.req.param('albumId'))
  if (albumId === null) return c.json({ error: 'Invalid album id' }, 400)
  const library = await libraryAlbumLookup.find(albumId)
  if (library === null) return c.json({ error: 'Album not found' }, 404)
  const none = { spotifyAlbum: null, tracks: [], libraryPositions: {} }
  if (!isSpotifyConfigured()) return c.json({ configured: false, ...none })
  if (library.tracks.length === 0 || !library.title || !library.artistName) return c.json({ configured: true, ...none })

  const key = fillCacheKey(albumId, library)
  let candidates = albumFillCache.get(key)
  if (!candidates) {
    if ((fillFailedUntil.get(key) ?? 0) > Date.now()) return c.json({ configured: true, ...none })
    let lookup = fillInFlight.get(key)
    if (!lookup) {
      lookup = findFillCandidates(library).finally(() => fillInFlight.delete(key))
      fillInFlight.set(key, lookup)
    }
    try {
      candidates = await lookup
      albumFillCache.set(key, candidates)
    } catch (err) {
      const retryMs = err instanceof SpotifyRateLimitError && err.retryAfter !== null ? err.retryAfter * 1000 : 0
      fillFailedUntil.delete(key)
      fillFailedUntil.set(key, Date.now() + Math.max(FILL_FAILURE_TTL_MS, retryMs))
      while (fillFailedUntil.size > SPOTIFY_ARTIST_ALBUMS_MAX_ENTRIES) fillFailedUntil.delete(fillFailedUntil.keys().next().value as string)
      return upstreamFailure(c, err, 'Spotify album fill failed')
    }
  }

  const fill = matchAlbumFill(library, candidates)
  return c.json({ configured: true, ...(fill ?? none) })
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

  const albums = await withLocalIds(entry.albums)
  if (c.req.query('details') !== '1') return c.json({ configured: true, spotifyArtist: entry.spotifyArtist, albums })
  // ?details=1 (the Spotify artist page) adds a Wikipedia summary.
  const summary = await withDeadline(getArtistSummary(entry.spotifyArtist?.name ?? ''), SUMMARY_DEADLINE_MS)
  return c.json({ configured: true, spotifyArtist: entry.spotifyArtist, albums, summary })
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

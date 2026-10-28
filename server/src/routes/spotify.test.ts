// GET /spotify/albums/:id/tracks — no database; fetch is stubbed, no real credentials.
import { test, after, beforeEach, describe } from 'node:test'
import assert from 'node:assert/strict'
import { Hono } from 'hono'
import spotify from './spotify.js'
import { resetSpotifyTokenCache } from '../services/spotify.js'

const realFetch = globalThis.fetch
const realEnv = { id: process.env.SPOTIFY_CLIENT_ID, secret: process.env.SPOTIFY_CLIENT_SECRET }
let apiCalls: string[] = []

const app = new Hono()
app.route('/spotify', spotify)

function stubSpotify(apiResponse: () => Response) {
  globalThis.fetch = (async (url: any) => {
    if (String(url).startsWith('https://accounts.spotify.com/')) {
      return new Response(JSON.stringify({ access_token: 'tok', expires_in: 3600 }))
    }
    apiCalls.push(String(url))
    return apiResponse()
  }) as any
}

beforeEach(() => {
  process.env.SPOTIFY_CLIENT_ID = 'cid'
  process.env.SPOTIFY_CLIENT_SECRET = 'csecret'
  resetSpotifyTokenCache()
  apiCalls = []
})
after(() => {
  globalThis.fetch = realFetch
  if (realEnv.id === undefined) delete process.env.SPOTIFY_CLIENT_ID; else process.env.SPOTIFY_CLIENT_ID = realEnv.id
  if (realEnv.secret === undefined) delete process.env.SPOTIFY_CLIENT_SECRET; else process.env.SPOTIFY_CLIENT_SECRET = realEnv.secret
})

test('400 for an id with a slash or bad characters', async () => {
  stubSpotify(() => new Response('{}'))
  assert.equal((await app.request('/spotify/albums/a%2Fb/tracks')).status, 400)
  assert.equal((await app.request('/spotify/albums/a-b/tracks')).status, 400)
  assert.equal((await app.request(`/spotify/albums/${'a'.repeat(65)}/tracks`)).status, 400)
  assert.equal(apiCalls.length, 0)
})

test('configured:false when env unset', async () => {
  delete process.env.SPOTIFY_CLIENT_ID
  stubSpotify(() => { throw new Error('should not be called') })
  const res = await app.request('/spotify/albums/abc123/tracks')
  assert.equal(res.status, 200)
  assert.deepEqual(await res.json(), { configured: false, album: null, tracks: [] })
})

test('200 with album and tracks', async () => {
  stubSpotify(() => new Response(JSON.stringify({
    id: 'abc123', name: 'Album', images: [], artists: [{ id: 'a', name: 'A' }],
    tracks: { items: [{ id: 't1', uri: 'spotify:track:t1', name: 'One', duration_ms: 5 }], next: null },
  })))
  const body: any = await (await app.request('/spotify/albums/abc123/tracks')).json()
  assert.equal(body.configured, true)
  assert.equal(body.album.imageUrl, null)
  assert.equal(body.tracks.length, 1)
  assert.equal(body.tracks[0].album.id, 'abc123')
})

test('429 passes Retry-After through; 404 and other upstream errors map to 404 / 502', async () => {
  stubSpotify(() => new Response('', { status: 429, headers: { 'Retry-After': '9' } }))
  let res = await app.request('/spotify/albums/abc123/tracks')
  assert.equal(res.status, 429)
  assert.equal(res.headers.get('Retry-After'), '9')
  assert.deepEqual(await res.json(), { error: 'Spotify rate limit exceeded', retryAfter: 9 })

  stubSpotify(() => new Response('', { status: 404 }))
  assert.equal((await app.request('/spotify/albums/abc123/tracks')).status, 404)

  const realErr = console.error
  console.error = () => {}
  try {
    stubSpotify(() => new Response('', { status: 500 }))
    res = await app.request('/spotify/albums/abc123/tracks')
  } finally { console.error = realErr }
  assert.equal(res.status, 502)
})

// --- GET /spotify/artists/:localArtistId/albums (local artist lookup and library matcher stubbed) ---
import { mock } from 'node:test'
import { spotifyLibraryMatcher } from '../services/spotifyLibraryMatch.js'
import { localArtistLookup, resetSpotifyArtistAlbumsCache } from './spotify.js'
import type { SpotifySearchResult } from '../services/spotify.js'

let matcherCalls = 0
let ownedAlbumIds = new Set<string>()
let ownedTrackIds = new Map<string, number>()
mock.method(spotifyLibraryMatcher, 'annotate', async (r: SpotifySearchResult) => {
  matcherCalls++
  return {
    tracks: r.tracks.map((t) => ({ ...t, localId: ownedTrackIds.get(t.id) ?? null })),
    artists: r.artists.map((a) => ({ ...a, localId: a.name === 'Owned Artist' ? 55 : null })),
    albums: r.albums.map((a) => ({ ...a, localId: ownedAlbumIds.has(a.id) ? 77 : null })),
  }
})
mock.method(localArtistLookup, 'findName', async (id: number) => (id === 5 ? 'Taylor Swift' : null))

const artistApi = (opts: { artists?: unknown[]; albums?: unknown[]; singlesTotal?: number; appearsOn?: unknown[]; releaseTracks?: Record<string, unknown[]> } = {}) => (url: string) => {
  if (url.includes('/search?')) {
    return new Response(JSON.stringify({ artists: { items: opts.artists ?? [{ id: 'ts', name: 'Taylor Swift' }] } }))
  }
  const u = new URL(url)
  const groups = u.searchParams.get('include_groups')
  if (groups === 'single,compilation') return new Response(JSON.stringify({ items: [], total: opts.singlesTotal ?? 0, next: null }))
  if (groups === 'appears_on') return new Response(JSON.stringify({ items: opts.appearsOn ?? [], next: null }))
  if (u.pathname.startsWith('/v1/albums/')) {
    const id = u.pathname.split('/').pop() as string
    return new Response(JSON.stringify({ id, name: `Release ${id}`, images: [], tracks: { items: opts.releaseTracks?.[id] ?? [], next: null } }))
  }
  return new Response(JSON.stringify({ items: opts.albums ?? [], next: null }))
}
const guestCalls = () => apiCalls.filter((u) => u.includes('include_groups=single') || u.includes('include_groups=appears_on') || u.includes('/v1/albums/'))
function stubArtistSpotify(handler: (url: string) => Response) {
  globalThis.fetch = (async (url: any) => {
    if (String(url).startsWith('https://accounts.spotify.com/')) {
      return new Response(JSON.stringify({ access_token: 'tok', expires_in: 3600 }))
    }
    apiCalls.push(String(url))
    return handler(String(url))
  }) as any
}
const albumRaw = (id: string, name: string) => ({ id, name, uri: `spotify:album:${id}`, release_date: '2020-01-01', images: [], artists: [] })

beforeEach(() => {
  resetSpotifyArtistAlbumsCache()
  matcherCalls = 0
  ownedAlbumIds = new Set()
})

test('artist albums: 400 for a non-integer id', async () => {
  stubArtistSpotify(artistApi())
  assert.equal((await app.request('/spotify/artists/abc/albums')).status, 400)
})

test('artist albums: 404 for a missing local artist', async () => {
  stubArtistSpotify(artistApi())
  assert.equal((await app.request('/spotify/artists/999/albums')).status, 404)
})

test('artist albums: configured:false when env unset', async () => {
  delete process.env.SPOTIFY_CLIENT_ID
  stubArtistSpotify(artistApi())
  const res = await app.request('/spotify/artists/5/albums')
  assert.equal(res.status, 200)
  assert.deepEqual(await res.json(), { configured: false, spotifyArtist: null, albums: [] })
  assert.equal(apiCalls.length, 0)
})

test('artist albums: returns unowned albums only', async () => {
  ownedAlbumIds = new Set(['owned'])
  stubArtistSpotify(artistApi({ albums: [albumRaw('owned', 'Fearless'), albumRaw('new', 'Lover')] }))
  const body = await (await app.request('/spotify/artists/5/albums')).json()
  assert.equal(body.configured, true)
  assert.deepEqual(body.spotifyArtist, { id: 'ts', name: 'Taylor Swift' })
  assert.deepEqual(body.albums.map((a: any) => a.id), ['new'])
  assert.equal(body.albums[0].localId, null)
  assert.equal(body.albums[0].releaseYear, '2020')
})

test('artist albums: a second request within ttl makes no Spotify calls but re-runs matching', async () => {
  stubArtistSpotify(artistApi({ albums: [albumRaw('a', 'Lover')] }))
  await app.request('/spotify/artists/5/albums')
  const callsAfterFirst = apiCalls.length
  const res = await app.request('/spotify/artists/5/albums')
  assert.equal(res.status, 200)
  assert.equal(apiCalls.length, callsAfterFirst)
  assert.equal(matcherCalls, 2)
})

test('artist albums: no exact Spotify artist match → 200 with null artist and no albums', async () => {
  stubArtistSpotify(artistApi({ artists: [{ id: 'x', name: 'Taylor Swift Piano Covers' }] }))
  const body = await (await app.request('/spotify/artists/5/albums')).json()
  assert.deepEqual(body, { configured: true, spotifyArtist: null, albums: [], hasOwnReleases: null, guestTracks: [] })
})

test('artist albums: an artist with albums has own releases and costs no extra Spotify calls', async () => {
  stubArtistSpotify(artistApi({ albums: [albumRaw('a', 'Lover')] }))
  const body = await (await app.request('/spotify/artists/5/albums')).json()
  assert.equal(body.hasOwnReleases, true)
  assert.deepEqual(body.guestTracks, [])
  assert.deepEqual(guestCalls(), [])
})

test('artist albums: albums the library owns still count as own releases', async () => {
  ownedAlbumIds = new Set(['owned'])
  stubArtistSpotify(artistApi({ albums: [albumRaw('owned', 'Fearless')] }))
  const body = await (await app.request('/spotify/artists/5/albums')).json()
  assert.deepEqual(body.albums, [])
  assert.equal(body.hasOwnReleases, true)
  assert.deepEqual(guestCalls(), [])
})

test('artist albums: singles only is not "not on Spotify" and skips the guest lookup', async () => {
  stubArtistSpotify(artistApi({ singlesTotal: 4 }))
  const body = await (await app.request('/spotify/artists/5/albums')).json()
  assert.equal(body.hasOwnReleases, true)
  assert.deepEqual(body.guestTracks, [])
  assert.ok(!apiCalls.some((u) => u.includes('include_groups=appears_on')))
})

test('artist albums: no releases of their own → hasOwnReleases false with guest tracks, cached', async () => {
  const me = { id: 'ts', name: 'Taylor Swift' }
  stubArtistSpotify(artistApi({
    appearsOn: [albumRaw('r1', 'Collab')],
    releaseTracks: { r1: [
      { id: 'g1', uri: 'spotify:track:g1', name: 'Guest Spot', artists: [{ id: 'x', name: 'Host' }, me], duration_ms: 1000 },
      { id: 'h1', uri: 'spotify:track:h1', name: 'Host Only', artists: [{ id: 'x', name: 'Host' }], duration_ms: 1000 },
    ] },
  }))
  const body = await (await app.request('/spotify/artists/5/albums')).json()
  assert.equal(body.hasOwnReleases, false)
  assert.deepEqual(body.albums, [])
  assert.deepEqual(body.guestTracks.map((t: any) => t.id), ['g1'])
  assert.equal(body.guestTracks[0].album.name, 'Release r1')

  const callsAfterFirst = apiCalls.length
  const again = await (await app.request('/spotify/artists/5/albums')).json()
  assert.equal(apiCalls.length, callsAfterFirst)
  assert.deepEqual(again.guestTracks.map((t: any) => t.id), ['g1'])
  assert.equal(again.hasOwnReleases, false)
})

test('artist albums: 429 passes through with Retry-After', async () => {
  stubArtistSpotify(() => new Response('{}', { status: 429, headers: { 'Retry-After': '7' } }))
  const res = await app.request('/spotify/artists/5/albums')
  assert.equal(res.status, 429)
  assert.equal(res.headers.get('Retry-After'), '7')
  assert.equal((await res.json()).retryAfter, 7)
})

// --- GET /spotify/catalog/artists/:spotifyId/albums (Spotify-only artist view) ---
const catalogApi = (opts: { artist?: unknown; artistStatus?: number; albums?: unknown[] } = {}) => (url: string) => {
  if (/\/artists\/[^/?]+$/.test(url.split('?')[0])) {
    if (opts.artistStatus) return new Response('', { status: opts.artistStatus })
    return new Response(JSON.stringify(opts.artist ?? { id: 'sza1', name: 'SZA', images: [{ url: 'http://img', width: 640 }], external_urls: { spotify: 'http://open/sza' } }))
  }
  return new Response(JSON.stringify({ items: opts.albums ?? [], next: null }))
}

test('catalog artist albums: 400 for a bad id, configured:false when env unset', async () => {
  stubArtistSpotify(catalogApi())
  assert.equal((await app.request('/spotify/catalog/artists/a-b/albums')).status, 400)
  delete process.env.SPOTIFY_CLIENT_ID
  const res = await app.request('/spotify/catalog/artists/sza1/albums')
  assert.deepEqual(await res.json(), { configured: false, spotifyArtist: null, albums: [] })
  assert.equal(apiCalls.length, 0)
})

test('catalog artist albums: every album, owned ones carrying their localId', async () => {
  ownedAlbumIds = new Set(['owned'])
  stubArtistSpotify(catalogApi({ albums: [albumRaw('owned', 'Ctrl'), albumRaw('new', 'SOS')] }))
  const body = await (await app.request('/spotify/catalog/artists/sza1/albums')).json()
  assert.equal(body.configured, true)
  assert.deepEqual(body.spotifyArtist, { id: 'sza1', name: 'SZA', imageUrl: 'http://img', externalUrl: 'http://open/sza' })
  assert.deepEqual(body.albums.map((a: any) => [a.id, a.localId]), [['owned', 77], ['new', null]])
})

test('catalog artist albums: cached per Spotify id, matching re-runs', async () => {
  stubArtistSpotify(catalogApi({ albums: [albumRaw('a', 'SOS')] }))
  await app.request('/spotify/catalog/artists/sza1/albums')
  const callsAfterFirst = apiCalls.length
  await app.request('/spotify/catalog/artists/sza1/albums')
  assert.equal(apiCalls.length, callsAfterFirst)
  assert.equal(matcherCalls, 2)
})

test('catalog artist albums: 404 when Spotify has no such artist', async () => {
  stubArtistSpotify(catalogApi({ artistStatus: 404 }))
  assert.equal((await app.request('/spotify/catalog/artists/nope/albums')).status, 404)
})

// --- POST /spotify/plays, GET /spotify/plays/recent-albums (spotifyPlays stubbed) ---
import { spotifyPlays } from '../services/spotifyPlays.js'

const recorded: unknown[] = []
mock.method(spotifyPlays, 'record', async (play: unknown, meta: unknown) => { recorded.push({ play, meta }) })
let recentSizes: number[] = []
mock.method(spotifyPlays, 'recentAlbums', async (size: number) => {
  recentSizes.push(size)
  return [{ id: 'sos1', name: 'SOS', imageUrl: null, artistName: 'SZA', last_played: '2026-10-25T00:00:00.000Z' }]
})

const postPlay = (body: unknown) => app.request('/spotify/plays', {
  method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
})

test('plays: records a valid Spotify track play', async () => {
  recorded.length = 0
  const res = await postPlay({ trackUri: 'spotify:track:abc', trackName: 'Snooze', albumSpotifyId: 'sos1', albumName: 'SOS' })
  assert.equal(res.status, 204)
  assert.equal(recorded.length, 1)
  assert.equal((recorded[0] as any).play.albumSpotifyId, 'sos1')
  assert.equal((recorded[0] as any).meta.userId, null)
})

test('plays: 400 for a non-track uri or a non-JSON body, nothing recorded', async () => {
  recorded.length = 0
  assert.equal((await postPlay({ trackUri: 'spotify:album:abc' })).status, 400)
  assert.equal((await app.request('/spotify/plays', { method: 'POST', body: 'nope' })).status, 400)
  assert.equal(recorded.length, 0)
})

test('plays: recent albums, size defaulted and capped', async () => {
  recentSizes = []
  const body = await (await app.request('/spotify/plays/recent-albums')).json()
  assert.deepEqual(body.map((a: any) => a.id), ['sos1'])
  await app.request('/spotify/plays/recent-albums?size=5000')
  assert.deepEqual(recentSizes, [20, 200])
})

// --- ?details=1 (Spotify album/artist pages): Wikipedia summary, library artist ---
import { wikiAlbumTitle } from './spotify.js'

test('wikiAlbumTitle drops Spotify edition tails but never empties a title', () => {
  assert.equal(wikiAlbumTitle('Rumours - 2004 Remaster'), 'Rumours')
  assert.equal(wikiAlbumTitle('SOS Deluxe: LANA'), 'SOS')
  assert.equal(wikiAlbumTitle('Ctrl (Deluxe)'), 'Ctrl (Deluxe)')
  assert.equal(wikiAlbumTitle('Back - To Black'), 'Back - To Black')
  assert.equal(wikiAlbumTitle('Deluxe'), 'Deluxe')
})

const wikiAndAlbum = (artistName: string, extract: string | null, albumName = 'Kind of Blue (Legacy Edition)') => (url: string) => {
  if (url.startsWith('https://en.wikipedia.org/')) {
    return extract && decodeURIComponent(url).includes('Kind of Blue')
      ? new Response(JSON.stringify({ extract, content_urls: { desktop: { page: 'https://en.wikipedia.org/wiki/Kind_of_Blue' } } }))
      : new Response('', { status: 404 })
  }
  return new Response(JSON.stringify({
    id: 'kob', name: albumName, release_date: '1959-08-17', label: 'Columbia', images: [],
    artists: [{ id: 'md', name: artistName }],
    tracks: { items: [{ id: 't1', uri: 'spotify:track:t1', name: 'So What', duration_ms: 5 }], next: null },
  }))
}

test('album details: summary, year, label and the library artist id', async () => {
  stubArtistSpotify(wikiAndAlbum('Owned Artist', 'Kind of Blue is a studio album by Miles Davis.'))
  const body = await (await app.request('/spotify/albums/kob/tracks?details=1')).json()
  assert.equal(body.album.releaseYear, '1959')
  assert.equal(body.album.label, 'Columbia')
  assert.equal(body.localArtistId, 55)
  assert.match(body.summary.summary, /studio album by Miles Davis/)
})

test('album details: no Wikipedia match and an unknown artist are nulls; plain requests skip both', async () => {
  stubArtistSpotify(wikiAndAlbum('Someone New', null, 'Unheard Of Album'))
  const body = await (await app.request('/spotify/albums/kob/tracks?details=1')).json()
  assert.equal(body.summary, null)
  assert.equal(body.localArtistId, null)
  apiCalls = []
  const plain = await (await app.request('/spotify/albums/kob/tracks')).json()
  assert.equal('summary' in plain, false)
  assert.equal(apiCalls.some((u) => u.includes('wikipedia')), false)
})

test('catalog artist details: adds a Wikipedia summary; plain requests skip it', async () => {
  stubArtistSpotify((url: string) => {
    if (url.startsWith('https://en.wikipedia.org/')) {
      return decodeURIComponent(url).includes('Zzwiki Singer')
        ? new Response(JSON.stringify({ extract: 'Zzwiki Singer is an American singer.' }))
        : new Response('', { status: 404 })
    }
    return catalogApi({ artist: { id: 'zz1', name: 'Zzwiki Singer', images: [] }, albums: [albumRaw('a', 'One')] })(url)
  })
  const plain = await (await app.request('/spotify/catalog/artists/zz1/albums')).json()
  assert.equal('summary' in plain, false)
  const body = await (await app.request('/spotify/catalog/artists/zz1/albums?details=1')).json()
  assert.match(body.summary.summary, /American singer/)
})

// --- GET /spotify/library-albums/:albumId/fill (library album lookup stubbed) ---
import { libraryAlbumLookup, resetAlbumFillCache } from './spotify.js'
import type { LibraryAlbumForFill } from '../services/spotifyAlbumFill.js'

const GH_TRACKS = ['Walk Away', "I Don't Have The Time", 'Take A Look Around', 'Funk #48', 'Funk #49', 'Collage', 'Asshtonpark',
  'Woman', 'Tend My Garden', 'The Bomber A: Closet Queen - Medley', 'Laguna Salada', 'Country Fever']
let fillLibrary: LibraryAlbumForFill | null = null
mock.method(libraryAlbumLookup, 'find', async (id: number) => (id === 20807 ? fillLibrary : null))

const fillAlbumRaw = (id: string, artist = 'James Gang') => ({
  id, name: 'Greatest Hits', uri: `spotify:album:${id}`, release_date: '1973-03-12', images: [], artists: [{ id: 'jg', name: artist }],
})
const fillApi = (opts: { searchAlbums?: unknown[]; status?: number } = {}) => (url: string) => {
  if (opts.status) return new Response('{}', { status: opts.status, headers: { 'Retry-After': '5' } })
  const u = new URL(url)
  if (u.pathname === '/v1/search') {
    return new Response(JSON.stringify({ albums: { items: opts.searchAlbums ?? [fillAlbumRaw('gh'), fillAlbumRaw('jw', 'Joe Walsh')] } }))
  }
  const id = u.pathname.split('/').pop() as string
  return new Response(JSON.stringify({
    id, name: 'Greatest Hits', images: [], artists: [{ id: 'jg', name: 'James Gang' }],
    tracks: { items: GH_TRACKS.map((name, i) => ({ id: `${id}${i}`, uri: `spotify:track:${id}${i}`, name, artists: [{ id: 'jg', name: 'James Gang' }], duration_ms: 1, disc_number: 1, track_number: i + 1 })), next: null },
  }))
}
const albumOpens = () => apiCalls.filter((u) => new URL(u).pathname.startsWith('/v1/albums/'))

describe('album fill', () => {
  beforeEach(() => {
    resetAlbumFillCache()
    fillLibrary = { title: 'Greatest Hits', artistName: 'James Gang', releaseYear: '1973', discNumber: null, tracks: [{ id: 1, title: 'the bomber', trackNumber: '10' }] }
  })

  test('album fill: 400 bad id, 404 unknown album, configured:false makes no Spotify calls', async () => {
    stubArtistSpotify(fillApi())
    assert.equal((await app.request('/spotify/library-albums/abc/fill')).status, 400)
    assert.equal((await app.request('/spotify/library-albums/1/fill')).status, 404)
    delete process.env.SPOTIFY_CLIENT_ID
    const res = await app.request('/spotify/library-albums/20807/fill')
    assert.equal(res.status, 200)
    assert.deepEqual(await res.json(), { configured: false, spotifyAlbum: null, tracks: [], libraryPositions: {} })
    assert.equal(apiCalls.length, 0)
  })

  test('album fill: James Gang shape fills the missing positions', async () => {
    stubArtistSpotify(fillApi())
    const body = await (await app.request('/spotify/library-albums/20807/fill')).json()
    assert.equal(body.configured, true)
    assert.equal(body.spotifyAlbum.id, 'gh')
    assert.deepEqual(body.tracks.map((t: any) => t.position), [1, 2, 3, 4, 5, 6, 7, 8, 9, 11, 12])
    assert.deepEqual(body.libraryPositions, { 1: 10 })
    assert.deepEqual(albumOpens().map((u) => new URL(u).pathname), ['/v1/albums/gh'])
  })

  test('album fill: no matching candidate gives a null spotifyAlbum and empty tracks', async () => {
    stubArtistSpotify(fillApi({ searchAlbums: [fillAlbumRaw('jw', 'Joe Walsh')] }))
    const body = await (await app.request('/spotify/library-albums/20807/fill')).json()
    assert.deepEqual(body, { configured: true, spotifyAlbum: null, tracks: [], libraryPositions: {} })
    assert.deepEqual(albumOpens(), [])
  })

  test('album fill: candidates are cached, but a newly uploaded library track takes its slot at once', async () => {
    stubArtistSpotify(fillApi())
    await app.request('/spotify/library-albums/20807/fill')
    const callsAfterFirst = apiCalls.length
    fillLibrary!.tracks.push({ id: 2, title: 'Take A Look Around', trackNumber: '3' })
    const body = await (await app.request('/spotify/library-albums/20807/fill')).json()
    assert.equal(apiCalls.length, callsAfterFirst)
    assert.ok(!body.tracks.some((t: any) => t.position === 3))
    assert.deepEqual(body.libraryPositions, { 1: 10, 2: 3 })
  })

  test('album fill: at most 5 candidates are opened', async () => {
    stubArtistSpotify(fillApi({ searchAlbums: Array.from({ length: 8 }, (_, i) => fillAlbumRaw(`c${i}`)) }))
    const body = await (await app.request('/spotify/library-albums/20807/fill')).json()
    assert.equal(albumOpens().length, 5)
    assert.equal(body.spotifyAlbum.id, 'c0')
  })

  test('album fill: one failing candidate fetch fails the fill, and the failure is remembered briefly', async () => {
    const ok = fillApi({ searchAlbums: [fillAlbumRaw('c0'), fillAlbumRaw('c1')] })
    stubArtistSpotify((url) => (url.endsWith('/v1/albums/c1') ? new Response('{}', { status: 500 }) : ok(url)))
    assert.equal((await app.request('/spotify/library-albums/20807/fill')).status, 502)
    const callsAfterFirst = apiCalls.length
    const res = await app.request('/spotify/library-albums/20807/fill')
    assert.equal(res.status, 200)
    assert.deepEqual(await res.json(), { configured: true, spotifyAlbum: null, tracks: [], libraryPositions: {} })
    assert.equal(apiCalls.length, callsAfterFirst)
  })

  test('album fill: concurrent requests share one Spotify lookup', async () => {
    stubArtistSpotify(fillApi())
    const [a, b] = await Promise.all([app.request('/spotify/library-albums/20807/fill'), app.request('/spotify/library-albums/20807/fill')])
    assert.equal((await a.json()).spotifyAlbum.id, 'gh')
    assert.equal((await b.json()).spotifyAlbum.id, 'gh')
    assert.equal(apiCalls.filter((u) => u.includes('/v1/search')).length, 1)
  })

  test('album fill: an album with no library tracks makes no Spotify calls', async () => {
    fillLibrary!.tracks = []
    stubArtistSpotify(fillApi())
    const body = await (await app.request('/spotify/library-albums/20807/fill')).json()
    assert.equal(body.spotifyAlbum, null)
    assert.equal(apiCalls.length, 0)
  })

  test('album fill: the candidate cap applies after the year filter', async () => {
    const raw = Array.from({ length: 6 }, (_, i) => ({ ...fillAlbumRaw(`y${i}`), release_date: i === 5 ? '1973-03-12' : '1990-01-01' }))
    stubArtistSpotify(fillApi({ searchAlbums: raw }))
    const body = await (await app.request('/spotify/library-albums/20807/fill')).json()
    assert.deepEqual(albumOpens().map((u) => new URL(u).pathname), ['/v1/albums/y5'])
    assert.equal(body.spotifyAlbum.id, 'y5')
  })

  test('album fill: a renamed album gets fresh candidates', async () => {
    stubArtistSpotify(fillApi())
    await app.request('/spotify/library-albums/20807/fill')
    const searches = () => apiCalls.filter((u) => u.includes('/v1/search')).length
    assert.equal(searches(), 1)
    fillLibrary!.title = 'Greatest Hits!'
    await app.request('/spotify/library-albums/20807/fill')
    assert.equal(searches(), 1)
    fillLibrary!.title = 'Best Of'
    await app.request('/spotify/library-albums/20807/fill')
    assert.equal(searches(), 2)
  })

  test('album fill: 429 passes through with Retry-After', async () => {
    stubArtistSpotify(fillApi({ status: 429 }))
    const res = await app.request('/spotify/library-albums/20807/fill')
    assert.equal(res.status, 429)
    assert.equal(res.headers.get('Retry-After'), '5')
  })
})

// --- ?details=1: the library tracks the user owns on a Spotify album ---
import { searchService } from '../services/searchService.js'

const libraryTrack = (id: number, duration: number | null) => ({ id, title: `Lib ${id}`, duration, url: `/stream/${id}`, artist: { id: 1, name: 'Miles Davis' }, album: { id: 9, title: 'Elsewhere' } })
mock.method(searchService, 'fetchTracksByIds', async (ids: number[]) =>
  ids.filter((id) => id !== 999).map((id) => libraryTrack(id, id === 102 ? 200 : 546)))

const ownedAlbumApi = (url: string) => {
  if (url.startsWith('https://en.wikipedia.org/')) return new Response('', { status: 404 })
  return new Response(JSON.stringify({
    id: 'owned1', name: 'Owned Songs Album', release_date: '1959-08-17', images: [], artists: [{ id: 'md', name: 'Miles Davis' }],
    tracks: { items: [
      { id: 'o1', uri: 'spotify:track:o1', name: 'So What', duration_ms: 545000, artists: [{ id: 'md', name: 'Miles Davis' }] },
      { id: 'o2', uri: 'spotify:track:o2', name: 'Freddie Freeloader', duration_ms: 300000, artists: [{ id: 'md', name: 'Miles Davis' }] },
      { id: 'o3', uri: 'spotify:track:o3', name: 'Blue in Green', duration_ms: 330000, artists: [{ id: 'md', name: 'Miles Davis' }] },
      { id: 'o4', uri: 'spotify:track:o4', name: 'Gone', duration_ms: 330000, artists: [{ id: 'md', name: 'Miles Davis' }] },
    ], next: null },
  }))
}

test('album details: libraryTracks maps owned Spotify tracks to playable library tracks, skipping different-length recordings', async () => {
  ownedTrackIds = new Map([['o1', 101], ['o2', 102], ['o4', 999]])
  stubArtistSpotify(ownedAlbumApi)
  try {
    const body = await (await app.request('/spotify/albums/owned1/tracks?details=1')).json()
    assert.deepEqual(Object.keys(body.libraryTracks), ['o1'])
    assert.equal(body.libraryTracks.o1.id, 101)
    assert.equal(body.libraryTracks.o1.url, '/stream/101')
    apiCalls = []
    const plain = await (await app.request('/spotify/albums/owned1/tracks')).json()
    assert.equal('libraryTracks' in plain, false)
  } finally {
    ownedTrackIds = new Map()
  }
})

test('album details: a failed library lookup gives empty libraryTracks, not an error', async () => {
  ownedTrackIds = new Map([['o1', 101]])
  const original = searchService.fetchTracksByIds
  ;(searchService as any).fetchTracksByIds = async () => { throw new Error('db down') }
  const quiet = console.error
  console.error = () => {}
  stubArtistSpotify(ownedAlbumApi)
  try {
    const res = await app.request('/spotify/albums/owned1/tracks?details=1')
    assert.equal(res.status, 200)
    assert.deepEqual((await res.json()).libraryTracks, {})
  } finally {
    ;(searchService as any).fetchTracksByIds = original
    console.error = quiet
    ownedTrackIds = new Map()
  }
})

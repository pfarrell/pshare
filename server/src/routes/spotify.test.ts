// GET /spotify/albums/:id/tracks — no database; fetch is stubbed, no real credentials.
import { test, after, beforeEach } from 'node:test'
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
mock.method(spotifyLibraryMatcher, 'annotate', async (r: SpotifySearchResult) => {
  matcherCalls++
  return {
    tracks: [],
    artists: r.artists.map((a) => ({ ...a, localId: a.name === 'Owned Artist' ? 55 : null })),
    albums: r.albums.map((a) => ({ ...a, localId: ownedAlbumIds.has(a.id) ? 77 : null })),
  }
})
mock.method(localArtistLookup, 'findName', async (id: number) => (id === 5 ? 'Taylor Swift' : null))

const artistApi = (opts: { artists?: unknown[]; albums?: unknown[] } = {}) => (url: string) => {
  if (url.includes('/search?')) {
    return new Response(JSON.stringify({ artists: { items: opts.artists ?? [{ id: 'ts', name: 'Taylor Swift' }] } }))
  }
  return new Response(JSON.stringify({ items: opts.albums ?? [], next: null }))
}
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
  assert.deepEqual(body, { configured: true, spotifyArtist: null, albums: [] })
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

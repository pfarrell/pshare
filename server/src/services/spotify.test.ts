// No database access and no real Spotify credentials: fetch is stubbed throughout.
import { test, after, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import {
  searchSpotify, getSpotifyAlbumTracks, mapSearchResponse, pickImageUrl, isSpotifyConfigured, resetSpotifyTokenCache,
  SpotifyNotConfiguredError, SpotifyRateLimitError, SpotifyApiError,
} from './spotify.js'

const realFetch = globalThis.fetch
const realNow = Date.now
const realEnv = { id: process.env.SPOTIFY_CLIENT_ID, secret: process.env.SPOTIFY_CLIENT_SECRET }

interface Call { url: string; init: any }
let calls: Call[] = []

beforeEach(() => {
  process.env.SPOTIFY_CLIENT_ID = 'cid'
  process.env.SPOTIFY_CLIENT_SECRET = 'csecret'
  resetSpotifyTokenCache()
  Date.now = realNow
  calls = []
})
after(() => {
  globalThis.fetch = realFetch
  Date.now = realNow
  if (realEnv.id === undefined) delete process.env.SPOTIFY_CLIENT_ID; else process.env.SPOTIFY_CLIENT_ID = realEnv.id
  if (realEnv.secret === undefined) delete process.env.SPOTIFY_CLIENT_SECRET; else process.env.SPOTIFY_CLIENT_SECRET = realEnv.secret
})

const json = (body: unknown, init: ResponseInit = {}) => new Response(JSON.stringify(body), init)
const tokenCalls = () => calls.filter((c) => c.url.startsWith('https://accounts.spotify.com/'))
const searchCalls = () => calls.filter((c) => c.url.startsWith('https://api.spotify.com/'))

// Stub: token endpoint hands out tok1, tok2, ...; search responses come from `onSearch`.
function stubFetch(onSearch: (call: Call, n: number) => Response | Promise<Response>, tokenDelayMs = 0) {
  let tokens = 0
  let searches = 0
  globalThis.fetch = (async (url: any, init: any) => {
    const call = { url: String(url), init }
    calls.push(call)
    if (call.url.startsWith('https://accounts.spotify.com/')) {
      if (tokenDelayMs) await new Promise((r) => setTimeout(r, tokenDelayMs))
      tokens++
      return json({ access_token: `tok${tokens}`, token_type: 'Bearer', expires_in: 3600 })
    }
    return onSearch(call, ++searches)
  }) as any
}

const emptySearch = () => json({ tracks: { items: [] }, albums: { items: [] }, artists: { items: [] } })

test('isSpotifyConfigured requires both env vars', () => {
  assert.equal(isSpotifyConfigured(), true)
  delete process.env.SPOTIFY_CLIENT_SECRET
  assert.equal(isSpotifyConfigured(), false)
  process.env.SPOTIFY_CLIENT_SECRET = 'x'
  delete process.env.SPOTIFY_CLIENT_ID
  assert.equal(isSpotifyConfigured(), false)
})

test('searchSpotify throws SpotifyNotConfiguredError without calling fetch', async () => {
  delete process.env.SPOTIFY_CLIENT_ID
  stubFetch(emptySearch)
  await assert.rejects(searchSpotify('x'), SpotifyNotConfiguredError)
  assert.equal(calls.length, 0)
})

test('fetches a client-credentials token with Basic auth, then searches with it', async () => {
  stubFetch(emptySearch)
  await searchSpotify('radiohead')
  const [tok] = tokenCalls()
  assert.equal(tok.init.method, 'POST')
  assert.equal(tok.init.headers.Authorization, `Basic ${Buffer.from('cid:csecret').toString('base64')}`)
  assert.equal(tok.init.body, 'grant_type=client_credentials')
  const [s] = searchCalls()
  assert.equal(s.init.headers.Authorization, 'Bearer tok1')
  const u = new URL(s.url)
  assert.equal(u.pathname, '/v1/search')
  assert.equal(u.searchParams.get('q'), 'radiohead')
  assert.equal(u.searchParams.get('type'), 'track,album,artist')
  assert.equal(u.searchParams.get('limit'), '10')
})

test('passes custom types and limit through', async () => {
  stubFetch(emptySearch)
  await searchSpotify('x', { types: ['artist'], limit: 3 })
  const u = new URL(searchCalls()[0].url)
  assert.equal(u.searchParams.get('type'), 'artist')
  assert.equal(u.searchParams.get('limit'), '3')
})

test('caches the token across searches', async () => {
  stubFetch(emptySearch)
  await searchSpotify('a')
  await searchSpotify('b')
  assert.equal(tokenCalls().length, 1)
  assert.deepEqual(searchCalls().map((c) => c.init.headers.Authorization), ['Bearer tok1', 'Bearer tok1'])
})

test('concurrent searches share a single in-flight token fetch', async () => {
  stubFetch(emptySearch, 20)
  await Promise.all([searchSpotify('a'), searchSpotify('b'), searchSpotify('c')])
  assert.equal(tokenCalls().length, 1)
  assert.equal(searchCalls().length, 3)
})

test('refreshes the token once it is near expiry', async () => {
  let now = 1_000_000
  Date.now = () => now
  stubFetch(emptySearch)
  await searchSpotify('a')
  now += 3600_000 - 120_000 // still more than the 60s margin left
  await searchSpotify('b')
  assert.equal(tokenCalls().length, 1)
  now += 90_000 // inside the margin
  await searchSpotify('c')
  assert.equal(tokenCalls().length, 2)
  assert.equal(searchCalls()[2].init.headers.Authorization, 'Bearer tok2')
})

test('a 401 drops the cached token and retries once with a fresh one', async () => {
  stubFetch((_c, n) => (n === 1 ? new Response('', { status: 401 }) : emptySearch()))
  const out = await searchSpotify('a')
  assert.deepEqual(out, { tracks: [], albums: [], artists: [] })
  assert.equal(tokenCalls().length, 2)
  assert.deepEqual(searchCalls().map((c) => c.init.headers.Authorization), ['Bearer tok1', 'Bearer tok2'])
})

test('a second consecutive 401 is surfaced as SpotifyApiError, not retried forever', async () => {
  stubFetch(() => new Response('', { status: 401 }))
  await assert.rejects(searchSpotify('a'), (err: any) => err instanceof SpotifyApiError && err.status === 401)
  assert.equal(searchCalls().length, 2)
})

test('a 429 throws SpotifyRateLimitError carrying Retry-After', async () => {
  stubFetch(() => new Response('', { status: 429, headers: { 'Retry-After': '7' } }))
  await assert.rejects(searchSpotify('a'), (err: any) => err instanceof SpotifyRateLimitError && err.retryAfter === 7)
  assert.equal(searchCalls().length, 1)
})

test('a 429 without Retry-After has retryAfter null', async () => {
  stubFetch(() => new Response('', { status: 429 }))
  await assert.rejects(searchSpotify('a'), (err: any) => err instanceof SpotifyRateLimitError && err.retryAfter === null)
})

test('other upstream failures throw SpotifyApiError with the status', async () => {
  stubFetch(() => new Response('', { status: 503 }))
  await assert.rejects(searchSpotify('a'), (err: any) => err instanceof SpotifyApiError && err.status === 503)
})

test('a failed token fetch is not cached', async () => {
  let fail = true
  globalThis.fetch = (async (url: any, init: any) => {
    calls.push({ url: String(url), init })
    if (String(url).startsWith('https://accounts.spotify.com/')) {
      return fail ? new Response('', { status: 500 }) : json({ access_token: 'good', expires_in: 3600 })
    }
    return emptySearch()
  }) as any
  await assert.rejects(searchSpotify('a'), SpotifyApiError)
  fail = false
  await searchSpotify('a')
  assert.equal(searchCalls()[0].init.headers.Authorization, 'Bearer good')
})

test('pickImageUrl prefers the smallest image >= 300px, else the largest, else null', () => {
  assert.equal(pickImageUrl([
    { url: 'big', width: 640, height: 640 },
    { url: 'mid', width: 300, height: 300 },
    { url: 'small', width: 64, height: 64 },
  ]), 'mid')
  assert.equal(pickImageUrl([{ url: 'a', width: 64 }, { url: 'b', width: 160 }]), 'b')
  assert.equal(pickImageUrl([{ url: 'nowidth', width: null }]), 'nowidth')
  assert.equal(pickImageUrl([]), null)
  assert.equal(pickImageUrl(null), null)
  assert.equal(pickImageUrl([{ url: null, width: 640 }]), null)
})

test('mapSearchResponse maps the full shape', () => {
  const out = mapSearchResponse({
    tracks: { items: [{
      id: 't1', uri: 'spotify:track:t1', name: 'Airbag',
      artists: [{ id: 'ar1', name: 'Radiohead' }],
      album: { id: 'al1', name: 'OK Computer', images: [{ url: 'img640', width: 640 }, { url: 'img300', width: 300 }] },
      duration_ms: 284000, explicit: false, external_urls: { spotify: 'https://open.spotify.com/track/t1' },
    }] },
    albums: { items: [{
      id: 'al1', uri: 'spotify:album:al1', name: 'OK Computer', artists: [{ id: 'ar1', name: 'Radiohead' }],
      release_date: '1997-05-21', total_tracks: 12, images: [{ url: 'img640', width: 640 }],
      external_urls: { spotify: 'https://open.spotify.com/album/al1' },
    }] },
    artists: { items: [{
      id: 'ar1', uri: 'spotify:artist:ar1', name: 'Radiohead', images: [{ url: 'a320', width: 320 }],
      external_urls: { spotify: 'https://open.spotify.com/artist/ar1' },
    }] },
  })
  assert.deepEqual(out.tracks, [{
    uri: 'spotify:track:t1', id: 't1', name: 'Airbag', artists: [{ id: 'ar1', name: 'Radiohead' }],
    album: { id: 'al1', name: 'OK Computer', imageUrl: 'img300' },
    durationMs: 284000, explicit: false, externalUrl: 'https://open.spotify.com/track/t1',
  }])
  assert.deepEqual(out.albums, [{
    uri: 'spotify:album:al1', id: 'al1', name: 'OK Computer', artists: [{ id: 'ar1', name: 'Radiohead' }],
    releaseYear: '1997', totalTracks: 12, imageUrl: 'img640', externalUrl: 'https://open.spotify.com/album/al1',
  }])
  assert.deepEqual(out.artists, [{
    uri: 'spotify:artist:ar1', id: 'ar1', name: 'Radiohead', imageUrl: 'a320', externalUrl: 'https://open.spotify.com/artist/ar1',
  }])
})

test('mapSearchResponse is defensive about null/missing fields', () => {
  const out = mapSearchResponse({
    tracks: { items: [null, { id: 't1', artists: null, album: null, duration_ms: null, explicit: null, external_urls: null }, { name: 'no id' }] },
    albums: { items: [{ id: 'al1', artists: [null as any, { id: 'x' }], release_date: null, total_tracks: null, images: null }] },
    artists: null,
  })
  assert.deepEqual(out.tracks, [{
    uri: '', id: 't1', name: '', artists: [], album: { id: '', name: '', imageUrl: null },
    durationMs: 0, explicit: false, externalUrl: null,
  }])
  assert.deepEqual(out.albums, [{
    uri: '', id: 'al1', name: '', artists: [{ id: 'x', name: '' }],
    releaseYear: null, totalTracks: null, imageUrl: null, externalUrl: null,
  }])
  assert.deepEqual(out.artists, [])
  assert.deepEqual(mapSearchResponse(null), { tracks: [], albums: [], artists: [] })
  assert.deepEqual(mapSearchResponse({}), { tracks: [], albums: [], artists: [] })
})

test('mapSearchResponse never emits objects where strings are expected', () => {
  const out = mapSearchResponse({
    tracks: { items: [{ id: 't1', name: { bogus: true } as any, artists: [{ id: 'a', name: { x: 1 } as any }] }] },
    albums: { items: [{ id: 'al1', release_date: '19' }] },
  })
  assert.equal(out.tracks[0].name, '')
  assert.equal(out.tracks[0].artists[0].name, '')
  assert.equal(out.albums[0].releaseYear, null)
})

const rawTrack = (n: number) => ({ id: `t${n}`, uri: `spotify:track:t${n}`, name: `Track ${n}`, artists: [{ id: 'a1', name: 'Artist' }], duration_ms: 1000 + n })
const NEXT_URL = 'https://api.spotify.com/v1/albums/alb1/tracks?offset=50&limit=50'

test('getSpotifyAlbumTracks follows tracks.next across pages', async () => {
  stubFetch((call) => {
    if (call.url === NEXT_URL) {
      return json({ items: Array.from({ length: 12 }, (_, i) => rawTrack(50 + i)), next: null })
    }
    return json({
      id: 'alb1', name: 'Album', images: [{ url: 'http://img/300', width: 300 }], artists: [{ id: 'a1', name: 'Artist' }],
      tracks: { items: Array.from({ length: 50 }, (_, i) => rawTrack(i)), next: NEXT_URL },
    })
  })
  const { album, tracks } = await getSpotifyAlbumTracks('alb1')
  assert.equal(tracks.length, 62)
  assert.deepEqual(tracks.map((t) => t.id), Array.from({ length: 62 }, (_, i) => `t${i}`))
  assert.deepEqual(album, { id: 'alb1', name: 'Album', imageUrl: 'http://img/300', artists: [{ id: 'a1', name: 'Artist' }] })
  assert.deepEqual(tracks[61].album, { id: 'alb1', name: 'Album', imageUrl: 'http://img/300' })
  assert.equal(searchCalls().length, 2)
  assert.equal(searchCalls()[0].url, 'https://api.spotify.com/v1/albums/alb1')
})

test('getSpotifyAlbumTracks maps null images, artists and durations safely', async () => {
  stubFetch(() => json({
    id: 'alb1', name: 'Album', images: null, artists: null,
    tracks: { items: [null, { id: 't1', uri: 'spotify:track:t1', name: 'One', artists: null, duration_ms: null }], next: null },
  }))
  const { album, tracks } = await getSpotifyAlbumTracks('alb1')
  assert.equal(album.imageUrl, null)
  assert.deepEqual(album.artists, [])
  assert.equal(tracks.length, 1)
  assert.deepEqual(tracks[0].artists, [])
  assert.equal(tracks[0].album.imageUrl, null)
  assert.equal(tracks[0].durationMs, 0)
})

test('getSpotifyAlbumTracks refuses to follow a next URL off the Spotify API', async () => {
  stubFetch(() => json({ id: 'alb1', tracks: { items: [rawTrack(1)], next: 'https://evil.example/steal' } }))
  await assert.rejects(getSpotifyAlbumTracks('alb1'), SpotifyApiError)
  assert.equal(calls.some((c) => c.url.includes('evil.example')), false)
})

test('getSpotifyAlbumTracks maps 429 and upstream errors', async () => {
  stubFetch(() => new Response('', { status: 429, headers: { 'Retry-After': '7' } }))
  await assert.rejects(getSpotifyAlbumTracks('alb1'), (e: any) => e instanceof SpotifyRateLimitError && e.retryAfter === 7)
  stubFetch(() => new Response('', { status: 500 }))
  await assert.rejects(getSpotifyAlbumTracks('alb1'), (e: any) => e instanceof SpotifyApiError && e.status === 500)
})

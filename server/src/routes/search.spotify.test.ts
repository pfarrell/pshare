// GET /search/spotify — kept out of search.test.ts because none of these
// cases touch the database (fetch is stubbed; no real Spotify credentials;
// the library matcher is stubbed — see spotifyLibraryMatch*.test.ts for it).
import { test, after, beforeEach, mock } from 'node:test'
import assert from 'node:assert/strict'
import { Hono } from 'hono'
import search from './search.js'
import { resetSpotifyTokenCache, type SpotifySearchResult } from '../services/spotify.js'
import { spotifyLibraryMatcher, withNullLocalIds, type AnnotatedSpotifyResult } from '../services/spotifyLibraryMatch.js'

const realFetch = globalThis.fetch
const realEnv = { id: process.env.SPOTIFY_CLIENT_ID, secret: process.env.SPOTIFY_CLIENT_SECRET }
let searchUrls: string[] = []

// Default: nothing is in the library. Individual tests swap the implementation.
let annotateImpl: (r: SpotifySearchResult) => Promise<AnnotatedSpotifyResult>
mock.method(spotifyLibraryMatcher, 'annotate', (r: SpotifySearchResult) => annotateImpl(r))

const app = new Hono()
app.route('/search', search)

function stubSpotify(searchResponse: () => Response) {
  globalThis.fetch = (async (url: any) => {
    if (String(url).startsWith('https://accounts.spotify.com/')) {
      return new Response(JSON.stringify({ access_token: 'tok', expires_in: 3600 }))
    }
    searchUrls.push(String(url))
    return searchResponse()
  }) as any
}

beforeEach(() => {
  process.env.SPOTIFY_CLIENT_ID = 'cid'
  process.env.SPOTIFY_CLIENT_SECRET = 'csecret'
  resetSpotifyTokenCache()
  searchUrls = []
  annotateImpl = async (r) => withNullLocalIds(r)
})
after(() => {
  mock.restoreAll()
  globalThis.fetch = realFetch
  if (realEnv.id === undefined) delete process.env.SPOTIFY_CLIENT_ID; else process.env.SPOTIFY_CLIENT_ID = realEnv.id
  if (realEnv.secret === undefined) delete process.env.SPOTIFY_CLIENT_SECRET; else process.env.SPOTIFY_CLIENT_SECRET = realEnv.secret
})

test('GET /search/spotify without q is a 400', async () => {
  stubSpotify(() => new Response('{}'))
  assert.equal((await app.request('/search/spotify')).status, 400)
  assert.equal((await app.request('/search/spotify?q=%20%20')).status, 400)
  assert.equal((await app.request('/search/spotify?q=%22%22')).status, 400)
  assert.equal(searchUrls.length, 0)
})

test('GET /search/spotify when unconfigured is 200 with configured:false and empty lists', async () => {
  delete process.env.SPOTIFY_CLIENT_ID
  stubSpotify(() => { throw new Error('should not be called') })
  const res = await app.request('/search/spotify?q=radiohead')
  assert.equal(res.status, 200)
  assert.deepEqual(await res.json(), { configured: false, tracks: [], albums: [], artists: [] })
})

test('GET /search/spotify returns mapped results and sends the raw (unquoted, unfiltered) query', async () => {
  stubSpotify(() => new Response(JSON.stringify({
    artists: { items: [{ id: 'ar1', uri: 'spotify:artist:ar1', name: 'The The', images: [] }] },
  })))
  const res = await app.request('/search/spotify?q=' + encodeURIComponent('  "The The"  '))
  assert.equal(res.status, 200)
  const body = await res.json()
  assert.equal(body.configured, true)
  assert.deepEqual(body.tracks, [])
  assert.deepEqual(body.albums, [])
  assert.deepEqual(body.artists, [{ uri: 'spotify:artist:ar1', id: 'ar1', name: 'The The', imageUrl: null, externalUrl: null, localId: null }])
  assert.equal(new URL(searchUrls[0]).searchParams.get('q'), 'The The')
})

const radioheadResponse = () => new Response(JSON.stringify({
  artists: { items: ['Radiohead', 'R.E.M.', 'Thom Yorke', 'Radio Radio'].map((name, i) => ({ id: `ar${i}`, name })) },
  albums: { items: [
    { id: 'al1', name: 'OK Computer', artists: [{ id: 'ar0', name: 'Radiohead' }] },
    { id: 'al2', name: 'Hail to the Thief (Live)', artists: [{ id: 'ar0', name: 'Radiohead' }] },
  ] },
  tracks: { items: [{ id: 't1', name: 'Karma Police', artists: [{ id: 'ar0', name: 'Radiohead' }] }] },
}))

test('GET /search/spotify drops unrelated artists and annotates every item with localId', async () => {
  stubSpotify(radioheadResponse)
  let matcherInput: SpotifySearchResult | null = null
  annotateImpl = async (r) => {
    matcherInput = r
    const out = withNullLocalIds(r)
    out.artists[0].localId = 1
    out.albums[0].localId = 2
    out.tracks[0].localId = 3
    return out
  }
  const res = await app.request('/search/spotify?q=radiohead')
  assert.equal(res.status, 200)
  const body = await res.json()
  assert.deepEqual(matcherInput!.artists.map((a) => a.name), ['Radiohead'])
  assert.deepEqual(body.artists.map((a: any) => [a.name, a.localId]), [['Radiohead', 1]])
  assert.deepEqual(body.albums.map((a: any) => [a.name, a.localId]), [['OK Computer', 2], ['Hail to the Thief (Live)', null]])
  assert.deepEqual(body.tracks.map((t: any) => [t.name, t.localId]), [['Karma Police', 3]])
})

test('GET /search/spotify still returns results (localId: null) when the library match throws', async () => {
  stubSpotify(radioheadResponse)
  annotateImpl = async () => { throw new Error('db down') }
  const realError = console.error
  console.error = () => {}
  try {
    const res = await app.request('/search/spotify?q=radiohead')
    assert.equal(res.status, 200)
    const body = await res.json()
    assert.equal(body.configured, true)
    assert.equal(body.albums.length, 2)
    for (const item of [...body.artists, ...body.albums, ...body.tracks]) assert.equal(item.localId, null)
  } finally {
    console.error = realError
  }
})

test('GET /search/spotify passes a Spotify 429 through with retryAfter', async () => {
  stubSpotify(() => new Response('', { status: 429, headers: { 'Retry-After': '12' } }))
  const res = await app.request('/search/spotify?q=x')
  assert.equal(res.status, 429)
  assert.equal(res.headers.get('Retry-After'), '12')
  assert.equal((await res.json()).retryAfter, 12)
})

test('GET /search/spotify maps other upstream failures to 502', async () => {
  stubSpotify(() => new Response('', { status: 500 }))
  const res = await app.request('/search/spotify?q=x')
  assert.equal(res.status, 502)
})

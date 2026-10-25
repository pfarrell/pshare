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

// The /album/:id/summary and /artist/:id/summary endpoints: the frontend's
// second chance at a Wikipedia summary when the page load gave up on it.
import 'dotenv/config'
import { test, after, afterEach } from 'node:test'
import assert from 'node:assert/strict'
import { Hono } from 'hono'
import albums from './albums.js'
import artists from './artists.js'
import { createArtist, createAlbum, cleanupFixtures } from '../test/fixtures.js'
import { SUMMARY_DEADLINE_MS } from '../services/wikipedia.js'

after(cleanupFixtures)
const realFetch = globalThis.fetch
afterEach(() => { globalThis.fetch = realFetch })

const app = new Hono()
app.route('/album', albums)
app.route('/artist', artists)

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

// Wikipedia slower than the page-load deadline, but well inside the fetch timeout.
const slowWikipedia = () => {
  globalThis.fetch = (async (input: RequestInfo | URL) => {
    await sleep(SUMMARY_DEADLINE_MS + 200)
    const title = decodeURIComponent(String(input).split('/').pop()!)
    return new Response(JSON.stringify({ extract: `About ${title}.`, content_urls: { desktop: { page: `https://en.wikipedia.org/wiki/${title}` } } }), { status: 200 })
  }) as typeof fetch
}

test('GET /album/:id/summary waits past the page-load deadline for a slow Wikipedia', async () => {
  const artist = await createArtist('summary-slow-artist')
  const album = await createAlbum('summary-slow-album', artist.id)
  slowWikipedia()

  const res = await app.request(`/album/${album.id}/summary`)
  assert.equal(res.status, 200)
  const body = await res.json()
  assert.match(body.summary.summary, new RegExp(album.title))
})

test('GET /artist/:id/summary waits past the page-load deadline for a slow Wikipedia', async () => {
  const artist = await createArtist('summary-slow-artist-page')
  slowWikipedia()

  const res = await app.request(`/artist/${artist.id}/summary`)
  assert.equal(res.status, 200)
  const body = await res.json()
  assert.match(body.summary.summary, new RegExp(artist.name))
})

test('GET /album/:id/summary returns { summary: null } when Wikipedia has no page', async () => {
  const artist = await createArtist('summary-miss-artist')
  const album = await createAlbum('summary-miss-album', artist.id)
  globalThis.fetch = (async () => new Response('', { status: 404 })) as typeof fetch

  const res = await app.request(`/album/${album.id}/summary`)
  assert.equal(res.status, 200)
  assert.deepEqual(await res.json(), { summary: null })
})

test('GET /album/:id/summary and /artist/:id/summary 404 for unknown ids', async () => {
  assert.equal((await app.request('/album/999999999/summary')).status, 404)
  assert.equal((await app.request('/artist/999999999/summary')).status, 404)
  assert.equal((await app.request('/album/abc/summary')).status, 404)
})

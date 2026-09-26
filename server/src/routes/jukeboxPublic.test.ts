// server/src/routes/jukeboxPublic.test.ts
import 'dotenv/config'
import { test, after } from 'node:test'
import assert from 'node:assert/strict'
import { Hono } from 'hono'
import { createArtist, createAlbum, createTrack, createUser, createJukeboxDevice, cleanupFixtures, fixtureName } from '../test/fixtures.js'
import jukeboxPublic from './jukeboxPublic.js'

after(cleanupFixtures)

const app = () => new Hono().route('/jukebox', jukeboxPublic)

test('GET /jukebox/:token/search returns results for a valid token', async () => {
  const owner = await createUser('jpub-search-owner')
  const device = await createJukeboxDevice('jpub-search-device', owner.id)
  const artist = await createArtist('jpub-search-artist')
  const album = await createAlbum(`jpub-search-album-${fixtureName('zzzunique')}`, artist.id)
  await createTrack('jpub-search-track', album.id, artist.id)

  const res = await app().request(`/jukebox/${device.enqueue_token}/search?q=zzzunique`)
  const body = await res.json()

  assert.equal(res.status, 200)
  assert.ok(body.results.some((r: any) => r.type === 'album'))
})

test('GET /jukebox/:token/search 404s for an unknown token', async () => {
  const res = await app().request('/jukebox/not-a-real-token/search?q=anything')
  assert.equal(res.status, 404)
})

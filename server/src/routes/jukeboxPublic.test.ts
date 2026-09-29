// server/src/routes/jukeboxPublic.test.ts
import 'dotenv/config'
import { test, after } from 'node:test'
import assert from 'node:assert/strict'
import { Hono } from 'hono'
import jwt from 'jsonwebtoken'
import { createArtist, createAlbum, createTrack, createUser, createJukeboxDevice, cleanupFixtures, fixtureName } from '../test/fixtures.js'
import jukeboxPublic from './jukeboxPublic.js'

after(cleanupFixtures)

const JWT_SECRET = process.env.BEMUSED_JWT_SECRET || 'default-secret-change-me'

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

test('POST /jukebox/:token/queue with a name creates a pending submission', async () => {
  const owner = await createUser('jpub-queue-owner')
  const device = await createJukeboxDevice('jpub-queue-device', owner.id)
  const artist = await createArtist('jpub-queue-artist')
  const album = await createAlbum('jpub-queue-album', artist.id)
  const track = await createTrack('jpub-queue-track', album.id, artist.id)

  const res = await app().request(`/jukebox/${device.enqueue_token}/queue`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ trackIds: [track.id], name: 'Riley' }),
  })
  const body = await res.json()

  assert.equal(res.status, 201)
  assert.equal(body[0].submitted_by_name, 'Riley')
  assert.equal(body[0].track_id, track.id)
})

test('POST /jukebox/:token/queue with a valid auth cookie attributes to the user, ignoring name', async () => {
  const owner = await createUser('jpub-queue-cookie-owner')
  const device = await createJukeboxDevice('jpub-queue-cookie-device', owner.id)
  const artist = await createArtist('jpub-queue-cookie-artist')
  const album = await createAlbum('jpub-queue-cookie-album', artist.id)
  const track = await createTrack('jpub-queue-cookie-track', album.id, artist.id)
  const submitter = await createUser('jpub-queue-cookie-submitter')
  const token = jwt.sign({ id: submitter.id, username: submitter.username, admin: submitter.admin }, JWT_SECRET, { expiresIn: '3650d' })

  const res = await app().request(`/jukebox/${device.enqueue_token}/queue`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', cookie: `auth=${token}` },
    body: JSON.stringify({ trackIds: [track.id], name: 'Riley' }),
  })
  const body = await res.json()

  assert.equal(res.status, 201)
  assert.equal(body[0].submitted_by_user_id, submitter.id)
  assert.equal(body[0].submitted_by_name, null)
})

test('POST /jukebox/:token/queue requires a name when there is no auth cookie', async () => {
  const owner = await createUser('jpub-queue-noname-owner')
  const device = await createJukeboxDevice('jpub-queue-noname-device', owner.id)
  const artist = await createArtist('jpub-queue-noname-artist')
  const album = await createAlbum('jpub-queue-noname-album', artist.id)
  const track = await createTrack('jpub-queue-noname-track', album.id, artist.id)

  const res = await app().request(`/jukebox/${device.enqueue_token}/queue`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ trackIds: [track.id] }),
  })

  assert.equal(res.status, 400)
})

test('POST /jukebox/:token/queue 404s for an unknown token', async () => {
  const res = await app().request('/jukebox/not-a-real-token/queue', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ trackIds: [1], name: 'Riley' }),
  })
  assert.equal(res.status, 404)
})

test('POST /jukebox/:token/queue accepts multiple track ids in one call', async () => {
  const owner = await createUser('jpub-queue-multi-owner')
  const device = await createJukeboxDevice('jpub-queue-multi-device', owner.id)
  const artist = await createArtist('jpub-queue-multi-artist')
  const album = await createAlbum('jpub-queue-multi-album', artist.id)
  const trackA = await createTrack('jpub-queue-multi-track-a', album.id, artist.id)
  const trackB = await createTrack('jpub-queue-multi-track-b', album.id, artist.id)

  const res = await app().request(`/jukebox/${device.enqueue_token}/queue`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ trackIds: [trackA.id, trackB.id], name: 'Riley' }),
  })
  const body = await res.json()

  assert.equal(res.status, 201)
  assert.deepEqual(body.map((s: any) => s.track_id).sort(), [trackA.id, trackB.id].sort())
})

test('POST /jukebox/:token/queue counts tracks, not requests, against the rate limit', async () => {
  const owner = await createUser('jpub-queue-ratelimit-owner')
  const device = await createJukeboxDevice('jpub-queue-ratelimit-device', owner.id)
  const artist = await createArtist('jpub-queue-ratelimit-artist')
  const album = await createAlbum('jpub-queue-ratelimit-album', artist.id)
  const track = await createTrack('jpub-queue-ratelimit-track', album.id, artist.id)
  const submit = (n: number) =>
    app().request(`/jukebox/${device.enqueue_token}/queue`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ trackIds: Array(n).fill(track.id), name: 'Riley' }),
    })

  assert.equal((await submit(250)).status, 201)
  assert.equal((await submit(50)).status, 201)
  assert.equal((await submit(1)).status, 429)
})

test('POST /jukebox/:token/queue rejects more than 500 ids in one request', async () => {
  const owner = await createUser('jpub-queue-cap-owner')
  const device = await createJukeboxDevice('jpub-queue-cap-device', owner.id)
  const res = await app().request(`/jukebox/${device.enqueue_token}/queue`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ trackIds: Array(501).fill(1), name: 'Riley' }),
  })
  assert.equal(res.status, 400)
})

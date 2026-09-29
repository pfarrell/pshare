// server/src/routes/jukeboxPublic.test.ts
import 'dotenv/config'
import { test, after } from 'node:test'
import assert from 'node:assert/strict'
import { Hono } from 'hono'
import jwt from 'jsonwebtoken'
import { createArtist, createAlbum, createTrack, createUser, createJukeboxDevice, createPlaylist, createCollection, cleanupFixtures, fixtureName } from '../test/fixtures.js'
import { db } from '../db/database.js'
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

async function guestDevice(label: string) {
  const owner = await createUser(`${label}-owner`)
  return createJukeboxDevice(`${label}-device`, owner.id)
}

const getJson = async (path: string, headers: Record<string, string> = {}) => {
  const res = await app().request(path, { headers })
  return { status: res.status, body: await res.json() }
}

test('every guest read endpoint 404s for an unknown token', async () => {
  for (const path of ['home', 'playlists', 'collections', 'artist/1', 'album/1', 'playlist/1', 'collection/1', 'album/1/track-ids']) {
    const res = await app().request(`/jukebox/not-a-real-token/${path}`)
    assert.equal(res.status, 404, path)
  }
})

test('GET /jukebox/:token/album/:id returns a trimmed album with tracks', async () => {
  const device = await guestDevice('jpub-album')
  const artist = await createArtist('jpub-album-artist')
  const album = await createAlbum('jpub-album-album', artist.id)
  const track = await createTrack('jpub-album-track', album.id, artist.id)
  await db.updateTable('tracks').set({ approved: true }).where('id', '=', track.id).execute()

  const { status, body } = await getJson(`/jukebox/${device.enqueue_token}/album/${album.id}`)

  assert.equal(status, 200)
  assert.equal(body.album.id, album.id)
  assert.equal(body.artist.id, artist.id)
  assert.equal(body.tracks[0].id, track.id)
  assert.deepEqual(Object.keys(body).sort(), ['album', 'artist', 'tracks'])
  assert.equal('url' in body.tracks[0], false, 'stream urls must not be exposed')
  assert.equal('download_url' in body.tracks[0], false)
})

test('GET /jukebox/:token/artist/:id returns albums and singles, trimmed', async () => {
  const device = await guestDevice('jpub-artist')
  const artist = await createArtist('jpub-artist-artist')
  const album = await createAlbum('jpub-artist-album', artist.id)
  const track = await createTrack('jpub-artist-track', album.id, artist.id)
  await db.updateTable('tracks').set({ approved: true }).where('id', '=', track.id).execute()

  const { status, body } = await getJson(`/jukebox/${device.enqueue_token}/artist/${artist.id}`)

  assert.equal(status, 200)
  assert.equal(body.artist.id, artist.id)
  assert.deepEqual(Object.keys(body).sort(), ['albums', 'artist', 'singles'])
  assert.ok(body.albums.some((a: any) => a.id === album.id))
})

test('GET /jukebox/:token/playlist/:id and /collection/:id return trimmed payloads', async () => {
  const device = await guestDevice('jpub-plcol')
  const playlist = await createPlaylist('jpub-plcol-playlist')
  const collection = await createCollection('jpub-plcol-collection')

  const pl = await getJson(`/jukebox/${device.enqueue_token}/playlist/${playlist.id}`)
  assert.equal(pl.status, 200)
  assert.deepEqual(Object.keys(pl.body).sort(), ['playlist', 'tracks'])
  assert.equal(pl.body.playlist.id, playlist.id)

  const col = await getJson(`/jukebox/${device.enqueue_token}/collection/${collection.id}`)
  assert.equal(col.status, 200)
  assert.deepEqual(Object.keys(col.body).sort(), ['albums', 'collection'])
  assert.equal(col.body.collection.id, collection.id)
})

test('guest detail routes 404 on a non-numeric or unknown id instead of erroring', async () => {
  const device = await guestDevice('jpub-badid')
  for (const path of ['artist/abc', 'album/abc', 'playlist/abc', 'collection/abc', 'artist/2147483647', 'collection/2147483647']) {
    const res = await app().request(`/jukebox/${device.enqueue_token}/${path}`)
    assert.equal(res.status, 404, path)
  }
})

test('a logged-in cookie does not add notes or user fields to guest detail payloads', async () => {
  const device = await guestDevice('jpub-cookie')
  const user = await createUser('jpub-cookie-user')
  const artist = await createArtist('jpub-cookie-artist')
  const album = await createAlbum('jpub-cookie-album', artist.id)
  const token = jwt.sign({ id: user.id, username: user.username, admin: user.admin }, JWT_SECRET, { expiresIn: '3650d' })

  const { body } = await getJson(`/jukebox/${device.enqueue_token}/album/${album.id}`, { cookie: `auth=${token}` })

  assert.equal('notes' in body, false)
  assert.deepEqual(Object.keys(body).sort(), ['album', 'artist', 'tracks'])
})

test('GET /jukebox/:token/home returns allowlisted artist and album cards', async () => {
  const device = await guestDevice('jpub-home')

  const artists = await getJson(`/jukebox/${device.enqueue_token}/home?mode=artists`)
  assert.equal(artists.status, 200)
  assert.ok(Array.isArray(artists.body))
  for (const a of artists.body) assert.deepEqual(Object.keys(a).sort(), ['album_count', 'id', 'image_path', 'name'])

  const albums = await getJson(`/jukebox/${device.enqueue_token}/home?mode=albums`)
  assert.equal(albums.status, 200)
  for (const a of albums.body) assert.deepEqual(Object.keys(a).sort(), ['artist', 'id', 'image_path', 'title', 'track_count'])
})

test('GET /jukebox/:token/playlists and /collections return lists', async () => {
  const device = await guestDevice('jpub-lists')
  const playlist = await createPlaylist('jpub-lists-playlist')
  const collection = await createCollection('jpub-lists-collection')

  const pls = await getJson(`/jukebox/${device.enqueue_token}/playlists`)
  assert.equal(pls.status, 200)
  assert.ok(pls.body.some((p: any) => p.id === playlist.id))
  for (const p of pls.body) assert.deepEqual(Object.keys(p).sort(), ['id', 'image_path', 'name', 'preview_albums', 'track_count'])

  const cols = await getJson(`/jukebox/${device.enqueue_token}/collections`)
  assert.equal(cols.status, 200)
  assert.ok(cols.body.some((c: any) => c.id === collection.id))
  for (const c of cols.body) assert.deepEqual(Object.keys(c).sort(), ['id', 'image_path', 'name', 'preview_albums'])
})

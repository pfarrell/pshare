// server/src/routes/jukeboxPublic.test.ts
import 'dotenv/config'
import { test, after } from 'node:test'
import assert from 'node:assert/strict'
import { Hono } from 'hono'
import jwt from 'jsonwebtoken'
import { createArtist, createAlbum, createTrack, createUser, createJukeboxDevice, createPlaylist, createCollection, cleanupFixtures, fixtureName } from '../test/fixtures.js'
import { db } from '../db/database.js'
import jukeboxPublic, { MAX_GUEST_QUEUE_IDS, MAX_GUEST_TRACKS, GUEST_TRACKS_PER_MINUTE, GUEST_READS_PER_MINUTE, GUEST_COMMANDS_PER_MINUTE, GUEST_QUEUE_POLLS_PER_MINUTE } from './jukeboxPublic.js'
import { MAX_PLAYLIST_TRACKS } from './playlists.js'
import { sseBroadcaster } from '../services/sseBroadcaster.js'
import { jukeboxStateService } from '../services/jukeboxStateService.js'

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

  assert.equal((await submit(500)).status, 201)
  assert.equal((await submit(500)).status, 201)
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

test('GET /jukebox/:token/album/:id/track-ids returns approved track ids in track order', async () => {
  const device = await guestDevice('jpub-ids-album')
  const artist = await createArtist('jpub-ids-album-artist')
  const album = await createAlbum('jpub-ids-album-album', artist.id)
  const second = await createTrack('jpub-ids-album-second', album.id, artist.id)
  const first = await createTrack('jpub-ids-album-first', album.id, artist.id)
  await db.updateTable('tracks').set({ approved: true, track_number: '2' }).where('id', '=', second.id).execute()
  await db.updateTable('tracks').set({ approved: true, track_number: '1' }).where('id', '=', first.id).execute()
  const hidden = await createTrack('jpub-ids-album-hidden', album.id, artist.id)
  await db.updateTable('tracks').set({ approved: false }).where('id', '=', hidden.id).execute()

  const { status, body } = await getJson(`/jukebox/${device.enqueue_token}/album/${album.id}/track-ids`)

  assert.equal(status, 200)
  assert.deepEqual(body.trackIds, [first.id, second.id])
})

test('GET track-ids works for a playlist and is empty for an empty playlist', async () => {
  const device = await guestDevice('jpub-ids-playlist')
  const artist = await createArtist('jpub-ids-playlist-artist')
  const album = await createAlbum('jpub-ids-playlist-album', artist.id)
  const track = await createTrack('jpub-ids-playlist-track', album.id, artist.id)
  await db.updateTable('tracks').set({ approved: true }).where('id', '=', track.id).execute()
  const playlist = await createPlaylist('jpub-ids-playlist-full')
  await db.insertInto('playlist_tracks').values({ playlist_id: playlist.id, track_id: track.id, order: 1 }).execute()
  const empty = await createPlaylist('jpub-ids-playlist-empty')

  const full = await getJson(`/jukebox/${device.enqueue_token}/playlist/${playlist.id}/track-ids`)
  assert.deepEqual(full.body.trackIds, [track.id])
  const none = await getJson(`/jukebox/${device.enqueue_token}/playlist/${empty.id}/track-ids`)
  assert.equal(none.status, 200)
  assert.deepEqual(none.body.trackIds, [])
})

test('track-ids 404s for artist/collection kinds, unknown kinds, bad ids and missing entities', async () => {
  const device = await guestDevice('jpub-ids-404')
  for (const path of ['artist/1/track-ids', 'collection/1/track-ids', 'bogus/1/track-ids', 'album/abc/track-ids', 'album/2147483647/track-ids', 'playlist/2147483647/track-ids']) {
    const res = await app().request(`/jukebox/${device.enqueue_token}/${path}`)
    assert.equal(res.status, 404, path)
  }
})

const postRandom = (token: string, path: string) =>
  app().request(`/jukebox/${token}/${path}/random-tracks`, { method: 'POST' })

test('POST random-tracks for an artist returns at most 25 of the artist tracks, never the whole catalog', async () => {
  const device = await guestDevice('jpub-rand-artist')
  const artist = await createArtist('jpub-rand-artist-artist')
  const album = await createAlbum('jpub-rand-artist-album', artist.id)
  const ids: number[] = []
  for (let i = 0; i < 30; i++) {
    const t = await createTrack(`jpub-rand-artist-track-${i}`, album.id, artist.id)
    ids.push(t.id)
  }
  await db.updateTable('tracks').set({ approved: true }).where('id', 'in', ids).execute()

  const res = await postRandom(device.enqueue_token, `artist/${artist.id}`)
  const body = await res.json()

  assert.equal(res.status, 200)
  assert.equal(body.trackIds.length, 25)
  assert.ok(body.trackIds.every((id: number) => ids.includes(id)))
  assert.equal(new Set(body.trackIds).size, 25, 'no duplicates')
})

test('POST random-tracks for a collection draws from its albums, capped at 25', async () => {
  const device = await guestDevice('jpub-rand-col')
  const artist = await createArtist('jpub-rand-col-artist')
  const collection = await createCollection('jpub-rand-col-collection')
  const ids: number[] = []
  for (let a = 0; a < 3; a++) {
    const album = await createAlbum(`jpub-rand-col-album-${a}`, artist.id)
    await db.insertInto('collection_albums').values({ collection_id: collection.id, album_id: album.id, order: a + 1 }).execute()
    for (let i = 0; i < 10; i++) {
      const t = await createTrack(`jpub-rand-col-track-${a}-${i}`, album.id, artist.id)
      ids.push(t.id)
    }
  }
  await db.updateTable('tracks').set({ approved: true }).where('id', 'in', ids).execute()

  const res = await postRandom(device.enqueue_token, `collection/${collection.id}`)
  const body = await res.json()

  assert.equal(res.status, 200)
  assert.equal(body.trackIds.length, 25)
  assert.ok(body.trackIds.every((id: number) => ids.includes(id)))
})

test('POST random-tracks is empty for an entity with no tracks', async () => {
  const device = await guestDevice('jpub-rand-empty')
  const collection = await createCollection('jpub-rand-empty-collection')
  const res = await postRandom(device.enqueue_token, `collection/${collection.id}`)
  assert.equal(res.status, 200)
  assert.deepEqual((await res.json()).trackIds, [])
})

test('POST random-tracks 404s for album/playlist kinds, unknown kinds, bad ids, missing entities and bad tokens', async () => {
  const device = await guestDevice('jpub-rand-404')
  for (const path of ['album/1', 'playlist/1', 'bogus/1', 'artist/abc', 'artist/2147483647', 'collection/2147483647']) {
    const res = await postRandom(device.enqueue_token, path)
    assert.equal(res.status, 404, path)
  }
  const badToken = await postRandom('not-a-real-token', 'artist/1')
  assert.equal(badToken.status, 404)
})

// A legitimate single add must never be un-addable: the limiter hard-rejects
// any request whose cost exceeds the whole window, so the window has to fit
// the biggest thing a guest can add in one tap.
test('limits are consistent: a full chunk and a full playlist both fit', () => {
  assert.ok(GUEST_TRACKS_PER_MINUTE >= MAX_GUEST_TRACKS, 'window must fit a whole max-size add')
  assert.ok(MAX_GUEST_TRACKS >= MAX_PLAYLIST_TRACKS, 'track-ids must not truncate a max-size playlist')
  assert.ok(MAX_GUEST_QUEUE_IDS <= GUEST_TRACKS_PER_MINUTE, 'a full request chunk must fit the window')
})

test('POST /jukebox/:token/queue accepts a full 500-id chunk from a fresh token', async () => {
  const owner = await createUser('jpub-queue-fullchunk-owner')
  const device = await createJukeboxDevice('jpub-queue-fullchunk-device', owner.id)
  const artist = await createArtist('jpub-queue-fullchunk-artist')
  const album = await createAlbum('jpub-queue-fullchunk-album', artist.id)
  const track = await createTrack('jpub-queue-fullchunk-track', album.id, artist.id)
  const submit = () =>
    app().request(`/jukebox/${device.enqueue_token}/queue`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ trackIds: Array(500).fill(track.id), name: 'Riley' }),
    })

  assert.equal((await submit()).status, 201)
  assert.equal((await submit()).status, 201, 'a 1000-track playlist is two 500-id chunks')
})

test('guest read endpoints are rate limited per token', async () => {
  const device = await guestDevice('jpub-readlimit')
  let limited = 0
  for (let i = 0; i < GUEST_READS_PER_MINUTE + 5; i++) {
    const res = await app().request(`/jukebox/${device.enqueue_token}/playlists`)
    if (res.status === 429) limited++
  }
  assert.equal(limited, 5)
})

test('read rate limiting does not create state for unknown tokens', async () => {
  for (let i = 0; i < GUEST_READS_PER_MINUTE + 5; i++) {
    const res = await app().request('/jukebox/not-a-real-token/playlists')
    assert.equal(res.status, 404)
  }
})

// --- Remote control: a logged-in user drives the kiosk's transport ----------
const authCookieFor = (user: { id: number; username: string; admin: boolean }) =>
  `auth=${jwt.sign({ id: user.id, username: user.username, admin: user.admin }, JWT_SECRET, { expiresIn: '3650d' })}`

const postCommand = (token: string, command: unknown, cookie?: string) =>
  app().request(`/jukebox/${token}/command`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(cookie ? { cookie } : {}) },
    body: JSON.stringify({ command }),
  })

test('POST /jukebox/:token/command broadcasts to the kiosk for a logged-in user', async () => {
  const device = await guestDevice('jpub-cmd-ok')
  const user = await createUser('jpub-cmd-ok-user')
  const received: unknown[] = []
  const unsub = sseBroadcaster.subscribeToCommands(device.id, (c) => received.push(c))

  for (const command of ['toggle', 'next', 'prev']) {
    const res = await postCommand(device.enqueue_token, command, authCookieFor(user))
    assert.equal(res.status, 200, command)
    assert.deepEqual(await res.json(), { ok: true })
  }

  assert.deepEqual(received, [{ command: 'toggle' }, { command: 'next' }, { command: 'prev' }])
  unsub()
})

test('POST /jukebox/:token/command 401s without a login and broadcasts nothing', async () => {
  const device = await guestDevice('jpub-cmd-anon')
  const received: unknown[] = []
  const unsub = sseBroadcaster.subscribeToCommands(device.id, (c) => received.push(c))

  const none = await postCommand(device.enqueue_token, 'next')
  const bad = await postCommand(device.enqueue_token, 'next', 'auth=not-a-real-jwt')

  assert.equal(none.status, 401)
  assert.equal(bad.status, 401)
  assert.deepEqual(received, [])
  unsub()
})

test('POST /jukebox/:token/command 400s on an unknown or missing command', async () => {
  const device = await guestDevice('jpub-cmd-bad')
  const user = await createUser('jpub-cmd-bad-user')
  const unsub = sseBroadcaster.subscribeToCommands(device.id, () => {})

  for (const command of ['seek', 'skip', '', null, 42, undefined]) {
    const res = await postCommand(device.enqueue_token, command, authCookieFor(user))
    assert.equal(res.status, 400, String(command))
  }
  const noBody = await app().request(`/jukebox/${device.enqueue_token}/command`, {
    method: 'POST',
    headers: { cookie: authCookieFor(user) },
  })
  assert.equal(noBody.status, 400)
  unsub()
})

test('POST /jukebox/:token/command 404s for an unknown token', async () => {
  const user = await createUser('jpub-cmd-404-user')
  const res = await postCommand('not-a-real-token', 'next', authCookieFor(user))
  assert.equal(res.status, 404)
})

test('POST /jukebox/:token/command 409s when no kiosk is connected', async () => {
  const device = await guestDevice('jpub-cmd-offline')
  const user = await createUser('jpub-cmd-offline-user')
  const res = await postCommand(device.enqueue_token, 'next', authCookieFor(user))
  assert.equal(res.status, 409)
  assert.match((await res.json()).error, /not connected/i)
})

test('POST /jukebox/:token/command is rate limited per token', async () => {
  const device = await guestDevice('jpub-cmd-rate')
  const user = await createUser('jpub-cmd-rate-user')
  const unsub = sseBroadcaster.subscribeToCommands(device.id, () => {})

  let limited = 0
  for (let i = 0; i < GUEST_COMMANDS_PER_MINUTE + 3; i++) {
    const res = await postCommand(device.enqueue_token, 'toggle', authCookieFor(user))
    if (res.status === 429) limited++
  }
  assert.equal(limited, 3)
  unsub()
})

const postCommandBody = (token: string, body: unknown, cookie?: string) =>
  app().request(`/jukebox/${token}/command`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(cookie ? { cookie } : {}) },
    body: JSON.stringify(body),
  })

test('POST command jump and remove broadcast the row index and track id', async () => {
  const device = await guestDevice('jpub-cmd-indexed')
  const user = await createUser('jpub-cmd-indexed-user')
  const received: unknown[] = []
  const unsub = sseBroadcaster.subscribeToCommands(device.id, (p) => received.push(p))

  for (const command of ['jump', 'remove']) {
    const res = await postCommandBody(device.enqueue_token, { command, index: 3, trackId: 42 }, authCookieFor(user))
    assert.equal(res.status, 200, command)
  }

  assert.deepEqual(received, [
    { command: 'jump', index: 3, trackId: 42 },
    { command: 'remove', index: 3, trackId: 42 },
  ])
  unsub()
})

test('POST command jump and remove 400 without a valid non-negative integer index and an integer trackId', async () => {
  const device = await guestDevice('jpub-cmd-indexed-bad')
  const user = await createUser('jpub-cmd-indexed-bad-user')
  const received: unknown[] = []
  const unsub = sseBroadcaster.subscribeToCommands(device.id, (p) => received.push(p))

  const bodies = [
    { command: 'jump' },
    { command: 'jump', index: 0 },
    { command: 'jump', trackId: 1 },
    { command: 'jump', index: -1, trackId: 1 },
    { command: 'remove', index: 1.5, trackId: 1 },
    { command: 'remove', index: '2', trackId: 1 },
    { command: 'remove', index: 2, trackId: '1' },
    { command: 'remove', index: 2, trackId: null },
  ]
  for (const body of bodies) {
    const res = await postCommandBody(device.enqueue_token, body, authCookieFor(user))
    assert.equal(res.status, 400, JSON.stringify(body))
  }
  assert.deepEqual(received, [])
  unsub()
})

test('POST command toggle/next/prev drop any extra index or trackId', async () => {
  const device = await guestDevice('jpub-cmd-extra')
  const user = await createUser('jpub-cmd-extra-user')
  const received: unknown[] = []
  const unsub = sseBroadcaster.subscribeToCommands(device.id, (p) => received.push(p))

  await postCommandBody(device.enqueue_token, { command: 'next', index: 7, trackId: 8 }, authCookieFor(user))

  assert.deepEqual(received, [{ command: 'next' }])
  unsub()
})

test('POST command jump requires a login like every other command', async () => {
  const device = await guestDevice('jpub-cmd-indexed-anon')
  const unsub = sseBroadcaster.subscribeToCommands(device.id, () => {})
  const res = await postCommandBody(device.enqueue_token, { command: 'jump', index: 1, trackId: 2 })
  assert.equal(res.status, 401)
  unsub()
})

// --- Phone queue read -----------------------------------------------------
const snapshot = () => ({
  queue: [
    { index: 4, id: 10, title: 'Now', artist: 'Band' },
    { index: 5, id: 11, title: 'Next', artist: null },
  ],
  currentIndex: 4,
  isPlaying: true,
  playbackMode: 'shuffle' as const,
})

test('GET /jukebox/:token/queue 404s for an unknown token', async () => {
  const res = await app().request('/jukebox/not-a-real-token/queue')
  assert.equal(res.status, 404)
})

test('GET /jukebox/:token/queue returns the kiosk snapshot with no login', async () => {
  const device = await guestDevice('jpub-queue-read')
  jukeboxStateService.set(device.id, snapshot())
  const unsub = sseBroadcaster.subscribeToCommands(device.id, () => {})

  const { status, body } = await getJson(`/jukebox/${device.enqueue_token}/queue`)

  assert.equal(status, 200)
  assert.deepEqual(body, { connected: true, ...snapshot() })
  assert.deepEqual(Object.keys(body.queue[0]).sort(), ['artist', 'id', 'index', 'title'])
  unsub()
})

test('GET /jukebox/:token/queue never returns a stale queue when no kiosk is connected', async () => {
  const device = await guestDevice('jpub-queue-stale')
  jukeboxStateService.set(device.id, snapshot())

  const { body } = await getJson(`/jukebox/${device.enqueue_token}/queue`)

  assert.deepEqual(body, { connected: false, queue: [], currentIndex: -1, isPlaying: false, playbackMode: 'off' })
})

test('GET /jukebox/:token/queue is connected with an empty queue before the kiosk has published', async () => {
  const device = await guestDevice('jpub-queue-nosnap')
  const unsub = sseBroadcaster.subscribeToCommands(device.id, () => {})

  const { body } = await getJson(`/jukebox/${device.enqueue_token}/queue`)

  assert.deepEqual(body, { connected: true, queue: [], currentIndex: -1, isPlaying: false, playbackMode: 'off' })
  unsub()
})

test('queue polling has its own limit and does not consume the browse read limit or commands', async () => {
  const device = await guestDevice('jpub-queue-limit')
  const user = await createUser('jpub-queue-limit-user')
  const unsub = sseBroadcaster.subscribeToCommands(device.id, () => {})

  let limited = 0
  for (let i = 0; i < GUEST_QUEUE_POLLS_PER_MINUTE + 3; i++) {
    const res = await app().request(`/jukebox/${device.enqueue_token}/queue`)
    if (res.status === 429) limited++
  }
  assert.equal(limited, 3)

  const browse = await app().request(`/jukebox/${device.enqueue_token}/playlists`)
  assert.equal(browse.status, 200, 'browse reads are unaffected')
  const cmd = await postCommand(device.enqueue_token, 'toggle', authCookieFor(user))
  assert.equal(cmd.status, 200, 'commands are unaffected')
  unsub()
})

import 'dotenv/config'
import { test, after } from 'node:test'
import assert from 'node:assert/strict'
import { Hono } from 'hono'
import jwt from 'jsonwebtoken'
import { createArtist, createAlbum, createTrack, createUser, createJukeboxDevice, cleanupFixtures } from '../test/fixtures.js'
import { authMiddleware, requireAuth } from '../middleware/auth.js'
import { jukeboxQueueService } from '../services/jukeboxQueueService.js'
import { sseBroadcaster } from '../services/sseBroadcaster.js'
import jukeboxDevices from './jukeboxDevices.js'

after(cleanupFixtures)

const JWT_SECRET = process.env.BEMUSED_JWT_SECRET || 'default-secret-change-me'

function deviceCookie(userId: number, username: string, deviceId: number) {
  const token = jwt.sign({ id: userId, username, admin: false, deviceId }, JWT_SECRET, { algorithm: 'HS256' })
  return `auth=${token}`
}

const app = () => {
  const hono = new Hono()
  hono.use('*', authMiddleware)
  hono.use('*', requireAuth)
  hono.route('/jukebox/devices', jukeboxDevices)
  return hono
}

test('GET /jukebox/devices/:id/queue/pending returns this device\'s pending submissions', async () => {
  const owner = await createUser('jdev-pending-owner')
  const device = await createJukeboxDevice('jdev-pending-device', owner.id)
  const artist = await createArtist('jdev-pending-artist')
  const album = await createAlbum('jdev-pending-album', artist.id)
  const track = await createTrack('jdev-pending-track', album.id, artist.id)
  const submission = await jukeboxQueueService.submit(device.id, track.id, { name: 'Riley' })

  const res = await app().request(`/jukebox/devices/${device.id}/queue/pending`, {
    headers: { Cookie: deviceCookie(owner.id, owner.username, device.id) },
  })
  const body = await res.json()

  assert.equal(res.status, 200)
  assert.deepEqual(body.map((s: any) => s.id), [submission.id])
})

test('GET /jukebox/devices/:id/queue/pending 403s for a different device\'s id', async () => {
  const owner = await createUser('jdev-pending-forbidden-owner')
  const device = await createJukeboxDevice('jdev-pending-forbidden-device', owner.id)
  const otherDevice = await createJukeboxDevice('jdev-pending-forbidden-other', owner.id)

  const res = await app().request(`/jukebox/devices/${otherDevice.id}/queue/pending`, {
    headers: { Cookie: deviceCookie(owner.id, owner.username, device.id) },
  })

  assert.equal(res.status, 403)
})

test('GET /jukebox/devices/:id/queue/pending 401s without a device cookie at all', async () => {
  const owner = await createUser('jdev-pending-noauth-owner')
  const device = await createJukeboxDevice('jdev-pending-noauth-device', owner.id)

  const res = await app().request(`/jukebox/devices/${device.id}/queue/pending`)

  assert.equal(res.status, 401)
})

test('POST /jukebox/devices/:id/queue/:submissionId/delivered marks it delivered', async () => {
  const owner = await createUser('jdev-delivered-owner')
  const device = await createJukeboxDevice('jdev-delivered-device', owner.id)
  const artist = await createArtist('jdev-delivered-artist')
  const album = await createAlbum('jdev-delivered-album', artist.id)
  const track = await createTrack('jdev-delivered-track', album.id, artist.id)
  const submission = await jukeboxQueueService.submit(device.id, track.id, { name: 'Riley' })

  const res = await app().request(`/jukebox/devices/${device.id}/queue/${submission.id}/delivered`, {
    method: 'POST',
    headers: { Cookie: deviceCookie(owner.id, owner.username, device.id) },
  })

  assert.equal(res.status, 200)
  assert.equal((await jukeboxQueueService.listPending(device.id)).length, 0)
})

test('POST /jukebox/devices/:id/queue/:submissionId/delivered 403s for a different device\'s id', async () => {
  const owner = await createUser('jdev-delivered-forbidden-owner')
  const device = await createJukeboxDevice('jdev-delivered-forbidden-device', owner.id)
  const otherDevice = await createJukeboxDevice('jdev-delivered-forbidden-other', owner.id)

  const res = await app().request(`/jukebox/devices/${otherDevice.id}/queue/999999/delivered`, {
    method: 'POST',
    headers: { Cookie: deviceCookie(owner.id, owner.username, device.id) },
  })

  assert.equal(res.status, 403)
})

test('POST /jukebox/devices/:id/rotate-token returns a new token that differs from the old one', async () => {
  const owner = await createUser('jdev-rotate-owner')
  const device = await createJukeboxDevice('jdev-rotate-device', owner.id)

  const res = await app().request(`/jukebox/devices/${device.id}/rotate-token`, {
    method: 'POST',
    headers: { Cookie: deviceCookie(owner.id, owner.username, device.id) },
  })
  const body = await res.json()

  assert.equal(res.status, 200)
  assert.notEqual(body.enqueue_token, device.enqueue_token)
})

test('POST /jukebox/devices/:id/rotate-token 403s for a different device\'s id', async () => {
  const owner = await createUser('jdev-rotate-forbidden-owner')
  const device = await createJukeboxDevice('jdev-rotate-forbidden-device', owner.id)
  const otherDevice = await createJukeboxDevice('jdev-rotate-forbidden-other', owner.id)

  const res = await app().request(`/jukebox/devices/${otherDevice.id}/rotate-token`, {
    method: 'POST',
    headers: { Cookie: deviceCookie(owner.id, owner.username, device.id) },
  })

  assert.equal(res.status, 403)
})

test('GET /jukebox/devices/:id/events streams a queue-item-added event when a submission is broadcast', async () => {
  const owner = await createUser('jdev-events-owner')
  const device = await createJukeboxDevice('jdev-events-device', owner.id)
  const artist = await createArtist('jdev-events-artist')
  const album = await createAlbum('jdev-events-album', artist.id)
  const track = await createTrack('jdev-events-track', album.id, artist.id)

  const res = await app().request(`/jukebox/devices/${device.id}/events`, {
    headers: { Cookie: deviceCookie(owner.id, owner.username, device.id) },
  })
  assert.equal(res.status, 200)
  assert.equal(res.headers.get('content-type'), 'text/event-stream')

  const reader = res.body!.getReader()
  const decoder = new TextDecoder()

  // Give the handler a tick to reach its subscribe call before broadcasting —
  // it's synchronous from the caller's perspective (subscribeToDevice runs
  // before the handler's first await), but a tick of slack keeps this robust.
  await new Promise((resolve) => setTimeout(resolve, 10))
  const submission = await jukeboxQueueService.submit(device.id, track.id, { name: 'Riley' })
  sseBroadcaster.broadcastQueueItemAdded(device.id, submission)

  const { value } = await reader.read()
  const text = decoder.decode(value)

  assert.match(text, /event: queue-item-added/)
  assert.match(text, new RegExp(`"id":${submission.id}`))
  await reader.cancel()
})

test('GET /jukebox/devices/:id/events streams a profiles-changed event on broadcast', async () => {
  const owner = await createUser('jdev-events-profiles-owner')
  const device = await createJukeboxDevice('jdev-events-profiles-device', owner.id)

  const res = await app().request(`/jukebox/devices/${device.id}/events`, {
    headers: { Cookie: deviceCookie(owner.id, owner.username, device.id) },
  })
  const reader = res.body!.getReader()
  const decoder = new TextDecoder()

  await new Promise((resolve) => setTimeout(resolve, 10))
  sseBroadcaster.broadcastProfilesChanged()

  const { value } = await reader.read()
  const text = decoder.decode(value)

  assert.match(text, /event: profiles-changed/)
  await reader.cancel()
})

test('GET /jukebox/devices/:id/events 403s for a different device\'s id', async () => {
  const owner = await createUser('jdev-events-forbidden-owner')
  const device = await createJukeboxDevice('jdev-events-forbidden-device', owner.id)
  const otherDevice = await createJukeboxDevice('jdev-events-forbidden-other', owner.id)

  const res = await app().request(`/jukebox/devices/${otherDevice.id}/events`, {
    headers: { Cookie: deviceCookie(owner.id, owner.username, device.id) },
  })

  assert.equal(res.status, 403)
})

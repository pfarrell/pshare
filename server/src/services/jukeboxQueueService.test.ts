// server/src/services/jukeboxQueueService.test.ts
import 'dotenv/config'
import { test, after } from 'node:test'
import assert from 'node:assert/strict'
import { createArtist, createAlbum, createTrack, createUser, createJukeboxDevice, cleanupFixtures } from '../test/fixtures.js'
import { jukeboxQueueService } from './jukeboxQueueService.js'

after(cleanupFixtures)

async function setup() {
  const owner = await createUser('queuesvc-owner')
  const device = await createJukeboxDevice('queuesvc-device', owner.id)
  const artist = await createArtist('queuesvc-artist')
  const album = await createAlbum('queuesvc-album', artist.id)
  const track = await createTrack('queuesvc-track', album.id, artist.id)
  return { owner, device, track }
}

test('findDeviceByToken finds a device by its enqueue_token', async () => {
  const { device } = await setup()
  const found = await jukeboxQueueService.findDeviceByToken(device.enqueue_token)
  assert.equal(found?.id, device.id)
})

test('findDeviceByToken returns undefined for an unknown token', async () => {
  const found = await jukeboxQueueService.findDeviceByToken('not-a-real-token')
  assert.equal(found, undefined)
})

test('rotateToken changes the token and the old one stops resolving', async () => {
  const { device } = await setup()
  const oldToken = device.enqueue_token
  const newToken = await jukeboxQueueService.rotateToken(device.id)

  assert.notEqual(newToken, oldToken)
  assert.equal(await jukeboxQueueService.findDeviceByToken(oldToken), undefined)
  assert.equal((await jukeboxQueueService.findDeviceByToken(newToken))?.id, device.id)
})

test('submit with a guest name creates a pending submission', async () => {
  const { device, track } = await setup()
  const submission = await jukeboxQueueService.submit(device.id, track.id, { name: 'Riley' })

  assert.equal(submission.jukebox_device_id, device.id)
  assert.equal(submission.track_id, track.id)
  assert.equal(submission.submitted_by_name, 'Riley')
  assert.equal(submission.submitted_by_user_id, null)
  assert.equal(submission.delivered_at, null)
})

test('submit with a userId creates a pending submission attributed to that user', async () => {
  const { device, track, owner } = await setup()
  const submission = await jukeboxQueueService.submit(device.id, track.id, { userId: owner.id })

  assert.equal(submission.submitted_by_user_id, owner.id)
  assert.equal(submission.submitted_by_name, null)
})

test('listPending returns only undelivered submissions for that device, oldest first', async () => {
  const { device, track } = await setup()
  const first = await jukeboxQueueService.submit(device.id, track.id, { name: 'A' })
  const second = await jukeboxQueueService.submit(device.id, track.id, { name: 'B' })
  await jukeboxQueueService.markDelivered(device.id, first.id)

  const pending = await jukeboxQueueService.listPending(device.id)

  assert.deepEqual(pending.map((p) => p.id), [second.id])
})

test('listPending never returns another device\'s submissions', async () => {
  const { device, track } = await setup()
  const owner2 = await createUser('queuesvc-owner-2')
  const otherDevice = await createJukeboxDevice('queuesvc-device-2', owner2.id)
  await jukeboxQueueService.submit(otherDevice.id, track.id, { name: 'Other' })
  await jukeboxQueueService.submit(device.id, track.id, { name: 'Mine' })

  const pending = await jukeboxQueueService.listPending(device.id)

  assert.equal(pending.length, 1)
  assert.equal(pending[0].submitted_by_name, 'Mine')
})

test('markDelivered sets delivered_at and returns true', async () => {
  const { device, track } = await setup()
  const submission = await jukeboxQueueService.submit(device.id, track.id, { name: 'A' })

  const result = await jukeboxQueueService.markDelivered(device.id, submission.id)

  assert.equal(result, true)
  assert.equal((await jukeboxQueueService.listPending(device.id)).length, 0)
})

test('markDelivered returns false for a submission belonging to a different device', async () => {
  const { device, track } = await setup()
  const owner2 = await createUser('queuesvc-owner-3')
  const otherDevice = await createJukeboxDevice('queuesvc-device-3', owner2.id)
  const submission = await jukeboxQueueService.submit(otherDevice.id, track.id, { name: 'Other' })

  const result = await jukeboxQueueService.markDelivered(device.id, submission.id)

  assert.equal(result, false)
  assert.equal((await jukeboxQueueService.listPending(otherDevice.id)).length, 1)
})

import 'dotenv/config'
import { test, after } from 'node:test'
import assert from 'node:assert/strict'
import { createUser, cleanupFixtures } from '../test/fixtures.js'
import { jukeboxDeviceService } from './jukeboxDeviceService.js'

after(cleanupFixtures)

test('create inserts a device row scoped to the user, findById reads it back', async () => {
  const user = await createUser('jukebox-owner')
  const device = await jukeboxDeviceService.create(user.id, 'Kitchen')

  assert.equal(device.user_id, user.id)
  assert.equal(device.name, 'Kitchen')

  const found = await jukeboxDeviceService.findById(device.id)
  assert.equal(found?.id, device.id)
  assert.equal(found?.name, 'Kitchen')
})

test('findById returns undefined for a nonexistent device', async () => {
  const found = await jukeboxDeviceService.findById(999999999)
  assert.equal(found, undefined)
})

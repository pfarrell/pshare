import { test } from 'node:test'
import assert from 'node:assert/strict'
import { sseBroadcaster } from './sseBroadcaster.js'

test('subscribeToDevice only receives broadcasts for its own device id', () => {
  const receivedA: unknown[] = []
  const receivedB: unknown[] = []
  const unsubA = sseBroadcaster.subscribeToDevice(1, (payload) => receivedA.push(payload))
  const unsubB = sseBroadcaster.subscribeToDevice(2, (payload) => receivedB.push(payload))

  sseBroadcaster.broadcastQueueItemAdded(1, { id: 'x' })

  assert.deepEqual(receivedA, [{ id: 'x' }])
  assert.deepEqual(receivedB, [])
  unsubA()
  unsubB()
})

test('unsubscribing a device listener stops further delivery', () => {
  const received: unknown[] = []
  const unsub = sseBroadcaster.subscribeToDevice(1, (payload) => received.push(payload))
  unsub()

  sseBroadcaster.broadcastQueueItemAdded(1, { id: 'x' })

  assert.deepEqual(received, [])
})

test('subscribeToProfiles receives every profiles-changed broadcast, regardless of device', () => {
  const calls: number[] = []
  const unsub = sseBroadcaster.subscribeToProfiles(() => calls.push(1))

  sseBroadcaster.broadcastProfilesChanged()
  sseBroadcaster.broadcastProfilesChanged()

  assert.equal(calls.length, 2)
  unsub()
})

test('broadcasting to a device with no subscribers does not throw', () => {
  assert.doesNotThrow(() => sseBroadcaster.broadcastQueueItemAdded(999, { id: 'x' }))
})

test('subscribeToCommands only receives commands for its own device id', () => {
  const receivedA: unknown[] = []
  const receivedB: unknown[] = []
  const unsubA = sseBroadcaster.subscribeToCommands(1, (command) => receivedA.push(command))
  const unsubB = sseBroadcaster.subscribeToCommands(2, (command) => receivedB.push(command))

  sseBroadcaster.broadcastPlaybackCommand(1, 'next')

  assert.deepEqual(receivedA, ['next'])
  assert.deepEqual(receivedB, [])
  unsubA()
  unsubB()
})

test('broadcastPlaybackCommand returns how many kiosks received it, and 0 when none are listening', () => {
  assert.equal(sseBroadcaster.broadcastPlaybackCommand(99, 'toggle'), 0)

  const unsubA = sseBroadcaster.subscribeToCommands(99, () => {})
  const unsubB = sseBroadcaster.subscribeToCommands(99, () => {})
  assert.equal(sseBroadcaster.broadcastPlaybackCommand(99, 'toggle'), 2)
  unsubA()
  unsubB()
  assert.equal(sseBroadcaster.broadcastPlaybackCommand(99, 'toggle'), 0)
})

test('queue-item subscribers do not receive playback commands', () => {
  const received: unknown[] = []
  const unsub = sseBroadcaster.subscribeToDevice(1, (payload) => received.push(payload))
  sseBroadcaster.broadcastPlaybackCommand(1, 'prev')
  assert.deepEqual(received, [])
  unsub()
})

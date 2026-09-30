import { test } from 'node:test'
import assert from 'node:assert/strict'
import { parseKioskState, jukeboxStateService, MAX_QUEUE_ENTRIES, MAX_TEXT_LENGTH } from './jukeboxStateService.js'

const valid = () => ({
  queue: [
    { index: 2, id: 10, title: 'Song', artist: 'Band' },
    { index: 3, id: 11, title: 'Other', artist: null },
  ],
  currentIndex: 2,
  isPlaying: true,
})

test('parses a valid snapshot', () => {
  assert.deepEqual(parseKioskState(valid()), valid())
})

test('accepts an empty queue with nothing playing', () => {
  assert.deepEqual(parseKioskState({ queue: [], currentIndex: -1, isPlaying: false }), { queue: [], currentIndex: -1, isPlaying: false })
})

test('trims over-long text and drops unknown fields', () => {
  const long = 'x'.repeat(MAX_TEXT_LENGTH + 50)
  const parsed = parseKioskState({
    queue: [{ index: 0, id: 1, title: long, artist: long, url: 'http://secret' }],
    currentIndex: 0,
    isPlaying: false,
    extra: 'nope',
  })!
  assert.equal(parsed.queue[0].title.length, MAX_TEXT_LENGTH)
  assert.equal(parsed.queue[0].artist!.length, MAX_TEXT_LENGTH)
  assert.deepEqual(Object.keys(parsed.queue[0]).sort(), ['artist', 'id', 'index', 'title'])
  assert.deepEqual(Object.keys(parsed).sort(), ['currentIndex', 'isPlaying', 'queue'])
})

test('rejects malformed snapshots', () => {
  const bad: unknown[] = [
    null, 'x', 42, {}, [],
    { ...valid(), queue: 'nope' },
    { ...valid(), queue: Array.from({ length: MAX_QUEUE_ENTRIES + 1 }, (_, i) => ({ index: i, id: i, title: 't', artist: null })) },
    { ...valid(), currentIndex: 1.5 },
    { ...valid(), currentIndex: -2 },
    { ...valid(), currentIndex: '2' },
    { ...valid(), isPlaying: 'yes' },
    { ...valid(), queue: [{ index: -1, id: 1, title: 't', artist: null }] },
    { ...valid(), queue: [{ index: 0, id: 'x', title: 't', artist: null }] },
    { ...valid(), queue: [{ index: 0, id: 1, title: 5, artist: null }] },
    { ...valid(), queue: [{ index: 0, id: 1, title: 't', artist: 5 }] },
    { ...valid(), queue: [null] },
  ]
  for (const body of bad) assert.equal(parseKioskState(body), null, JSON.stringify(body)?.slice(0, 60))
})

test('accepts exactly the maximum number of entries', () => {
  const queue = Array.from({ length: MAX_QUEUE_ENTRIES }, (_, i) => ({ index: i, id: i + 1, title: 't', artist: null }))
  assert.equal(parseKioskState({ queue, currentIndex: 0, isPlaying: false })!.queue.length, MAX_QUEUE_ENTRIES)
})

test('the store keeps only the latest snapshot per device', () => {
  jukeboxStateService.set(901, valid())
  jukeboxStateService.set(901, { queue: [], currentIndex: -1, isPlaying: false })
  jukeboxStateService.set(902, valid())
  assert.deepEqual(jukeboxStateService.get(901), { queue: [], currentIndex: -1, isPlaying: false })
  assert.deepEqual(jukeboxStateService.get(902), valid())
  assert.equal(jukeboxStateService.get(903), undefined)
})

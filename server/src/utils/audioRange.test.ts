import { test } from 'node:test'
import assert from 'node:assert/strict'
import { parseId3v2Length, parseByteRange } from './audioRange.js'

const header = (version: number, flags: number, body: number) => {
  const h = Buffer.alloc(10)
  h.write('ID3', 0, 'latin1')
  h[3] = version
  h[5] = flags
  h[6] = (body >> 21) & 0x7f
  h[7] = (body >> 14) & 0x7f
  h[8] = (body >> 7) & 0x7f
  h[9] = body & 0x7f
  return h
}

test('parseId3v2Length is the 10-byte header plus the syncsafe body size', () => {
  assert.equal(parseId3v2Length(header(3, 0, 87383)), 87393)
  assert.equal(parseId3v2Length(header(4, 0, 6095166)), 6095176)
})

test('parseId3v2Length adds the 10-byte footer only for v2.4 tags that flag one', () => {
  assert.equal(parseId3v2Length(header(4, 0x10, 100)), 120)
  assert.equal(parseId3v2Length(header(3, 0x10, 100)), 110)
})

test('parseId3v2Length is 0 for non-ID3 data and for a non-syncsafe size', () => {
  assert.equal(parseId3v2Length(Buffer.from('RIFF....WAVE')), 0)
  assert.equal(parseId3v2Length(Buffer.from('ID3')), 0)
  const bad = header(3, 0, 10)
  bad[8] = 0x80
  assert.equal(parseId3v2Length(bad), 0)
})

test('parseByteRange: no header or an unparseable one means serve the whole file', () => {
  assert.equal(parseByteRange(undefined, 1000), null)
  assert.equal(parseByteRange('', 1000), null)
  assert.equal(parseByteRange('bytes=-', 1000), null)
  assert.equal(parseByteRange('items=0-5', 1000), null)
  assert.equal(parseByteRange('bytes=0-5,10-20', 1000), null)
})

test('parseByteRange: open-ended, bounded and suffix ranges', () => {
  assert.deepEqual(parseByteRange('bytes=0-', 1000), { start: 0, end: 999 })
  assert.deepEqual(parseByteRange('bytes=100-199', 1000), { start: 100, end: 199 })
  assert.deepEqual(parseByteRange('bytes=-200', 1000), { start: 800, end: 999 })
  assert.deepEqual(parseByteRange('bytes=-5000', 1000), { start: 0, end: 999 })
})

test('parseByteRange clamps an end past EOF instead of promising bytes that do not exist', () => {
  assert.deepEqual(parseByteRange('bytes=900-1500000', 1000), { start: 900, end: 999 })
})

test('parseByteRange: ranges outside the file are unsatisfiable', () => {
  assert.equal(parseByteRange('bytes=1000-', 1000), 'unsatisfiable')
  assert.equal(parseByteRange('bytes=5000-6000', 1000), 'unsatisfiable')
  assert.equal(parseByteRange('bytes=10-5', 1000), 'unsatisfiable')
  assert.equal(parseByteRange('bytes=-0', 1000), 'unsatisfiable')
})

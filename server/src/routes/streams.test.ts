import 'dotenv/config'
import { test, after } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'fs'
import { Hono } from 'hono'
import streams from './streams.js'
import { createArtist, createAlbum, createMediaFile, createTrack, cleanupFixtures } from '../test/fixtures.js'

const written: string[] = []
after(async () => {
  for (const f of written) fs.rmSync(f, { force: true })
  await cleanupFixtures()
})

const app = new Hono().route('/stream', streams)

const id3Tag = (bodyBytes: number) => {
  const h = Buffer.alloc(10 + bodyBytes, 0x41) // 'A' filler stands in for embedded art
  h.write('ID3', 0, 'latin1')
  h[3] = 4
  h[4] = 0
  h[5] = 0
  h[6] = (bodyBytes >> 21) & 0x7f
  h[7] = (bodyBytes >> 14) & 0x7f
  h[8] = (bodyBytes >> 7) & 0x7f
  h[9] = bodyBytes & 0x7f
  return h
}

// The "audio" is distinguishable byte-for-byte so a wrong offset shows up.
const AUDIO = Buffer.from(Array.from({ length: 2000 }, (_, i) => i % 251))

const trackWithFile = async (label: string, contents: Buffer) => {
  const artist = await createArtist(`${label}-artist`)
  const album = await createAlbum(`${label}-album`, artist.id)
  const media = await createMediaFile(`${label}-media`)
  fs.writeFileSync(media.absolute_path as string, contents)
  written.push(media.absolute_path as string)
  return createTrack(`${label}-track`, album.id, artist.id, media.id)
}

const get = async (id: number, range?: string) => {
  const res = await app.request(`/stream/${id}`, { headers: range ? { range } : {} })
  return { res, body: Buffer.from(await res.arrayBuffer()) }
}

test('a leading ID3v2 tag is not served: the stream starts at the first audio frame', async () => {
  const track = await trackWithFile('stream-tagged', Buffer.concat([id3Tag(5000), AUDIO]))

  const { res, body } = await get(track.id)
  assert.equal(res.status, 200)
  assert.equal(res.headers.get('content-length'), String(AUDIO.length))
  assert.deepEqual(body, AUDIO)
})

test('byte ranges are relative to the audio, not the file', async () => {
  const track = await trackWithFile('stream-tagged-range', Buffer.concat([id3Tag(5000), AUDIO]))

  const first = await get(track.id, 'bytes=0-9')
  assert.equal(first.res.status, 206)
  assert.equal(first.res.headers.get('content-range'), `bytes 0-9/${AUDIO.length}`)
  assert.deepEqual(first.body, AUDIO.subarray(0, 10))

  const open = await get(track.id, 'bytes=1990-')
  assert.equal(open.res.headers.get('content-range'), `bytes 1990-1999/${AUDIO.length}`)
  assert.deepEqual(open.body, AUDIO.subarray(1990))

  const suffix = await get(track.id, 'bytes=-4')
  assert.deepEqual(suffix.body, AUDIO.subarray(AUDIO.length - 4))
})

test('an end past EOF is clamped and a start past EOF is a 416', async () => {
  const track = await trackWithFile('stream-tagged-eof', Buffer.concat([id3Tag(300), AUDIO]))

  const over = await get(track.id, 'bytes=1900-9999999')
  assert.equal(over.res.status, 206)
  assert.equal(over.res.headers.get('content-length'), '100')
  assert.deepEqual(over.body, AUDIO.subarray(1900))

  const past = await get(track.id, `bytes=${AUDIO.length}-`)
  assert.equal(past.res.status, 416)
  assert.equal(past.res.headers.get('content-range'), `bytes */${AUDIO.length}`)
})

test('a file with no ID3 tag is served unchanged', async () => {
  const track = await trackWithFile('stream-untagged', AUDIO)

  const whole = await get(track.id)
  assert.deepEqual(whole.body, AUDIO)

  const ranged = await get(track.id, 'bytes=100-199')
  assert.equal(ranged.res.headers.get('content-range'), `bytes 100-199/${AUDIO.length}`)
  assert.deepEqual(ranged.body, AUDIO.subarray(100, 200))
})

test('a tag that claims to fill the whole file is ignored rather than serving an empty stream', async () => {
  // header claims a 500-byte body, but the file is only 100 bytes long
  const bogus = Buffer.concat([id3Tag(500).subarray(0, 10), Buffer.alloc(90, 0x42)])
  const track = await trackWithFile('stream-bogus-tag', bogus)

  const { res, body } = await get(track.id)
  assert.equal(res.status, 200)
  assert.equal(body.length, 100)
})

// server/src/services/mbidService.test.ts
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { resolveManualMbid } from './mbidService.js'

const MBID = '5b11f4ce-a62d-471e-81fc-a69a8278c7da'
const found = async () => ({ id: MBID, name: 'Nirvana' })

test('undefined raw means the field was not submitted', async () => {
  assert.deepEqual(await resolveManualMbid('artist', undefined, MBID, found), { ok: true, update: null, sameAsCurrent: false })
})

test('blank clears only when something is set', async () => {
  assert.deepEqual(await resolveManualMbid('artist', '  ', MBID, found), {
    ok: true, update: { musicbrainz_id: null, mbid_confidence: null, mbid_status: 'unmatched' }, entity: null, sameAsCurrent: false,
  })
  assert.deepEqual(await resolveManualMbid('artist', '', null, found), { ok: true, update: null, sameAsCurrent: false })
})

test('invalid input and wrong URL type are 400s with extractMbid messages', async () => {
  assert.deepEqual(await resolveManualMbid('artist', 'nope', null, found), { ok: false, status: 400, error: "Doesn't look like a MusicBrainz ID or URL" })
  const res = await resolveManualMbid('artist', `https://musicbrainz.org/release/${MBID}`, null, found)
  assert.equal(res.ok, false)
  assert.equal((res as { status: number }).status, 400)
})

test('same as current is a no-op flagged sameAsCurrent', async () => {
  assert.deepEqual(await resolveManualMbid('release', MBID.toUpperCase(), MBID, found), { ok: true, update: null, sameAsCurrent: true })
})

test('unreachable mirror → 502; unknown id → 400; found → manual update', async () => {
  const boom = async () => { throw new Error('down') }
  assert.deepEqual(await resolveManualMbid('artist', MBID, null, boom), { ok: false, status: 502, error: 'Could not reach MusicBrainz to verify — try again' })
  assert.deepEqual(await resolveManualMbid('release', MBID, null, async () => null), { ok: false, status: 400, error: 'No such release found on MusicBrainz' })
  assert.deepEqual(await resolveManualMbid('artist', `https://musicbrainz.org/artist/${MBID}`, null, found), {
    ok: true, update: { musicbrainz_id: MBID, mbid_confidence: 1.0, mbid_status: 'manual' }, entity: { id: MBID, name: 'Nirvana' }, sameAsCurrent: false,
  })
})

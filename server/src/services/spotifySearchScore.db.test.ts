// server/src/services/spotifySearchScore.db.test.ts
// DB-backed: the scores come from Postgres (pg_trgm + f_unaccent), so they
// can only be checked against a real database. No fixture rows are needed.
import 'dotenv/config'
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { spotifySearchScorer } from './spotifySearchScore.js'
import { withNullLocalIds, type AnnotatedSpotifyResult } from './spotifyLibraryMatch.js'

const artist = (name: any) => ({ uri: '', id: String(name), name, imageUrl: null, externalUrl: null })
const album = (name: any) => ({
  uri: '', id: String(name), name, artists: [], releaseYear: null, totalTracks: null, imageUrl: null, externalUrl: null,
})
const track = (name: any) => ({
  uri: '', id: String(name), name, artists: [], album: { id: '', name: '', imageUrl: null }, durationMs: 0, explicit: false, externalUrl: null,
})

const result = (r: { artists?: any[]; albums?: any[]; tracks?: any[] }): AnnotatedSpotifyResult =>
  withNullLocalIds({ artists: r.artists ?? [], albums: r.albums ?? [], tracks: r.tracks ?? [] })

test('score gives 2 to names containing the query, a trigram similarity to near misses, and null otherwise', async () => {
  const scored = await spotifySearchScorer.score(result({
    artists: [artist('Radiohead'), artist('Radiohed')],
    albums: [album('Radiohead Live'), album('OK Computer')],
  }), 'radiohead', false)

  assert.equal(scored.artists[0].score, 2)
  assert.equal(typeof scored.artists[1].score, 'number')
  assert.ok(scored.artists[1].score! >= 0.24 && scored.artists[1].score! < 1, `fuzzy score ${scored.artists[1].score}`)
  assert.equal(scored.albums[0].score, 2)
  assert.equal(scored.albums[1].score, null)
})

test('tracks only score on a contains match, like library track search', async () => {
  const scored = await spotifySearchScorer.score(result({
    tracks: [track('Radiohead Medley'), track('Creep'), track('Radiohed')],
  }), 'radiohead', false)

  assert.deepEqual(scored.tracks.map((t) => t.score), [2, null, null])
})

test('exactOnly drops the fuzzy branch', async () => {
  const scored = await spotifySearchScorer.score(result({
    artists: [artist('Radiohead'), artist('Radiohed')],
  }), 'radiohead', true)

  assert.deepEqual(scored.artists.map((a) => a.score), [2, null])
})

test('matching ignores accents and case', async () => {
  const scored = await spotifySearchScorer.score(result({ artists: [artist('Sigur Rós')] }), 'SIGUR ROS', false)

  assert.equal(scored.artists[0].score, 2)
})

test('a missing or non-string name scores null without throwing', async () => {
  const scored = await spotifySearchScorer.score(result({
    artists: [artist(undefined), artist(42)],
  }), 'radiohead', false)

  assert.deepEqual(scored.artists.map((a) => a.score), [null, null])
})

test('an empty result needs no query and keeps its shape', async () => {
  const scored = await spotifySearchScorer.score(result({}), 'radiohead', false)

  assert.deepEqual(scored, { artists: [], albums: [], tracks: [] })
})

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { resolveTrackIdsForSuggestion, MAX_SUGGEST_NAME_TRACKS, resolveGeneratedPlaylistName } from './playlists.js'

test('resolveTrackIdsForSuggestion returns integer ids in order', () => {
  assert.deepEqual(resolveTrackIdsForSuggestion([3, 1, 2]), [3, 1, 2])
})

test('resolveTrackIdsForSuggestion filters out non-integer entries', () => {
  assert.deepEqual(resolveTrackIdsForSuggestion([1, 'two', 3.5, null, undefined, 4]), [1, 4])
})

test('resolveTrackIdsForSuggestion returns an empty array for non-array input', () => {
  assert.deepEqual(resolveTrackIdsForSuggestion('not an array'), [])
  assert.deepEqual(resolveTrackIdsForSuggestion(undefined), [])
  assert.deepEqual(resolveTrackIdsForSuggestion(null), [])
})

test('resolveTrackIdsForSuggestion caps at the max track count', () => {
  const ids = Array.from({ length: MAX_SUGGEST_NAME_TRACKS + 10 }, (_, i) => i + 1)
  const result = resolveTrackIdsForSuggestion(ids)
  assert.equal(result.length, MAX_SUGGEST_NAME_TRACKS)
  assert.deepEqual(result, ids.slice(0, MAX_SUGGEST_NAME_TRACKS))
})

test('resolveGeneratedPlaylistName prefers the AI-suggested name when present', () => {
  assert.equal(resolveGeneratedPlaylistName('upbeat cleaning music', 'Scrub Anthems'), 'Scrub Anthems')
})

test('resolveGeneratedPlaylistName falls back to the truncated prompt when no suggestion is available', () => {
  assert.equal(resolveGeneratedPlaylistName('upbeat cleaning music', null), 'upbeat cleaning music')
})

test('resolveGeneratedPlaylistName truncates the fallback prompt to 60 characters', () => {
  const longPrompt = 'a'.repeat(100)
  assert.equal(resolveGeneratedPlaylistName(longPrompt, null), 'a'.repeat(60))
})

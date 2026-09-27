import { test } from 'node:test'
import assert from 'node:assert/strict'
import { resolveTrackIdsForSuggestion, MAX_SUGGEST_NAME_TRACKS } from './playlists.js'

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

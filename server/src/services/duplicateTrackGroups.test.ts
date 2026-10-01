import { test } from 'node:test'
import assert from 'node:assert/strict'
import { groupDuplicateTracks } from './duplicateTrackGroups.js'

const t = (id: number, title: string, album_id = 1, media_file_id: number | null = null) => ({ id, title, album_id, media_file_id })

test('groups all versions together and orders biggest group first', () => {
  const groups = groupDuplicateTracks(
    [t(1, 'Song A'), t(2, 'Song B'), t(3, 'Song B'), t(4, 'Song A'), t(5, 'Song A'), t(6, 'Other')],
    new Set(),
  )
  assert.deepEqual(groups.map((g) => g.tracks.map((x) => x.id)), [[1, 4, 5], [2, 3]])
})

test('tier 1 only when every member shares one media file', () => {
  const same = groupDuplicateTracks([t(1, 'x', 1, 9), t(2, 'y', 1, 9)], new Set())
  assert.equal(same[0].tier, 1)
  const mixed = groupDuplicateTracks([t(1, 'Same', 1, 9), t(2, 'Same', 1, 9), t(3, 'Same', 1, 8)], new Set())
  assert.equal(mixed[0].tier, 2)
  assert.equal(mixed[0].tracks.length, 3)
})

test('dismissing a track against the others removes it from the group', () => {
  const groups = groupDuplicateTracks(
    [t(1, 'Song'), t(2, 'Song'), t(3, 'Song')],
    new Set(['1-3', '2-3']),
  )
  assert.deepEqual(groups.map((g) => g.tracks.map((x) => x.id)), [[1, 2]])
})

test('never groups across albums and tolerates null titles', () => {
  const groups = groupDuplicateTracks(
    [t(1, 'Song', 1), t(2, 'Song', 2), { id: 3, title: null as unknown as string, album_id: 1, media_file_id: null }],
    new Set(),
  )
  assert.equal(groups.length, 0)
})

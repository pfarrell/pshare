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

type Extra = { duration_sec?: number | null; file_hash?: string | null; chromaprint_key?: string | null; musicbrainz_recording_id?: string | null }
const x = (id: number, title: string, extra: Extra, media_file_id: number | null = null) => ({ ...t(id, title, 1, media_file_id), ...extra })

test('same media file links differently-titled tracks, shown once per file, and reports the reason', () => {
  const g = groupDuplicateTracks([t(1, 'x', 1, 9), t(2, 'y', 1, 9), t(3, 'x', 1, 8)], new Set())
  assert.deepEqual(g.map((r) => r.tracks.map((tr) => tr.id)), [[1, 3]])
  assert.deepEqual(g[0].reasons, ['file', 'title'])
})

test('tracks already consolidated onto one media file collapse to one entry in a larger group', () => {
  const groups = groupDuplicateTracks([t(1, 'Song', 1, 10), t(2, 'Song', 1, 10), t(3, 'Song', 1, 11)], new Set())
  assert.equal(groups.length, 1)
  assert.deepEqual(groups[0].tracks.map((m) => m.id), [1, 3])
})

test('a group whose tracks already share one media file is resolved and not reported', () => {
  assert.deepEqual(groupDuplicateTracks([t(1, 'Song One', 1, 9), t(2, 'Song One', 1, 9), t(3, 'Song One', 1, 9)], new Set()), [])
  assert.deepEqual(groupDuplicateTracks([x(1, 'Alpha', { file_hash: 'abc' }, 9), x(2, 'Beta', { file_hash: 'abc' }, 9)], new Set()), [])
  // still pending while any member points elsewhere or has no file
  assert.equal(groupDuplicateTracks([t(1, 'Song One', 1, 9), t(2, 'Song One', 1, 9), t(3, 'Song One', 1, null)], new Set()).length, 1)
})

test('same md5 on different media file rows groups tracks with unrelated titles', () => {
  const g = groupDuplicateTracks([x(1, 'Alpha', { file_hash: 'abc' }, 1), x(2, 'Beta', { file_hash: 'abc' }, 2), x(3, 'Gamma', { file_hash: 'zzz' }, 3)], new Set())
  assert.deepEqual(g.map((r) => r.tracks.map((tr) => tr.id)), [[1, 2]])
  assert.deepEqual(g[0].reasons, ['md5'])
})

test('identical chromaprint groups tracks with different md5 and titles', () => {
  const g = groupDuplicateTracks([x(1, 'Alpha', { file_hash: 'a', chromaprint_key: 'fp' }), x(2, 'Beta', { file_hash: 'b', chromaprint_key: 'fp' })], new Set())
  assert.deepEqual(g[0].reasons, ['chromaprint'])
})

test('same MusicBrainz recording groups tracks with different titles when lengths agree', () => {
  const g = groupDuplicateTracks([x(1, 'Alpha', { musicbrainz_recording_id: 'm', duration_sec: 200 }), x(2, 'Beta', { musicbrainz_recording_id: 'm', duration_sec: 202 })], new Set())
  assert.deepEqual(g[0].reasons, ['musicbrainz'])
})

test('a poisoned MusicBrainz id (unrelated songs, very different lengths) does not group them', () => {
  const g = groupDuplicateTracks([
    x(1, 'Alpha', { musicbrainz_recording_id: 'm', duration_sec: 200 }),
    x(2, 'Beta', { musicbrainz_recording_id: 'm', duration_sec: 95 }),
    x(3, 'Gamma', { musicbrainz_recording_id: 'm', duration_sec: 410 }),
  ], new Set())
  assert.deepEqual(g, [])
})

test('an id shared by many tracks on one album is a collision, not a duplicate set', () => {
  const sections = Array.from({ length: 12 }, (_, i) => x(i + 1, `Part ${i + 1} of the bit`, { musicbrainz_recording_id: 'm', chromaprint_key: 'fp', duration_sec: 300 }))
  assert.deepEqual(groupDuplicateTracks(sections, new Set()), [])
  const three = sections.slice(0, 3)
  assert.equal(groupDuplicateTracks(three, new Set())[0].tracks.length, 3)
})

test('chromaprint and MusicBrainz matches need lengths within a few seconds', () => {
  const fp = (d: number) => ({ chromaprint_key: 'fp', musicbrainz_recording_id: 'm', duration_sec: d })
  assert.deepEqual(groupDuplicateTracks([x(1, 'Alpha', fp(200)), x(2, 'Beta', fp(209))], new Set()), [])
  assert.equal(groupDuplicateTracks([x(1, 'Alpha', fp(200)), x(2, 'Beta', fp(202))], new Set()).length, 1)
})

test('a group lists every reason that linked it, strongest first', () => {
  const g = groupDuplicateTracks([
    x(1, 'Same Song', { musicbrainz_recording_id: 'm', duration_sec: 200 }, 5),
    x(2, 'Same Song', { musicbrainz_recording_id: 'm', duration_sec: 201 }, 5),
    x(3, 'Same Song', { duration_sec: 200 }, 6),
  ], new Set())
  assert.equal(g.length, 1)
  assert.deepEqual(g[0].reasons, ['file', 'musicbrainz', 'title'])
})

test('dismissed pairs are not linked by exact signals either', () => {
  const g = groupDuplicateTracks([x(1, 'Alpha', { file_hash: 'abc' }), x(2, 'Beta', { file_hash: 'abc' })], new Set(['1-2']))
  assert.deepEqual(g, [])
})

test('dismissing a track against the others removes it from the group', () => {
  const groups = groupDuplicateTracks(
    [t(1, 'Song'), t(2, 'Song'), t(3, 'Song')],
    new Set(['1-3', '2-3']),
  )
  assert.deepEqual(groups.map((g) => g.tracks.map((x) => x.id)), [[1, 2]])
})

test('short titles that are substrings of other titles do not chain a compilation into one giant group', () => {
  const titles = ['Love', 'Love Me Do', 'Lovely Day', 'Beloved', 'Me', 'Maybe Baby', 'Me and Bobby McGee', 'Day', 'Day Tripper', 'Tripper']
  const groups = groupDuplicateTracks(titles.map((title, i) => t(i + 1, title)), new Set())
  assert.deepEqual(groups, [])
})

test('a chain of loosely related titles stays split rather than merging through intermediates', () => {
  // A~B and B~C by substring, but A and C are not duplicates of each other
  const groups = groupDuplicateTracks([t(1, 'Rock Around the Clock'), t(2, 'Rock Around the Clock Live Version'), t(3, 'Rock Around the Clock Live Version Extended Mix')], new Set())
  assert.ok(groups.every((g) => g.tracks.length <= 2))
})

test('real duplicates still group: case, punctuation, and parenthetical differences', () => {
  const groups = groupDuplicateTracks(
    [t(1, "Rock Around The Clock"), t(2, 'Rock around the clock (Remastered)'), t(3, "Rock Around the Clock!")],
    new Set(),
  )
  assert.deepEqual(groups.map((g) => g.tracks.map((x) => x.id)), [[1, 2, 3]])
})

test('prefix-only matches ("Track 2" / "Track 20", "Variation V" / "Variation VI") are not duplicates', () => {
  const groups = groupDuplicateTracks([t(1, 'Variation V'), t(2, 'Variation VI'), t(3, 'Sonata No 2'), t(4, 'Sonata No 20')], new Set())
  assert.deepEqual(groups, [])
})

test('placeholder titles are ignored for title matching but same-file still groups them', () => {
  const titleOnly = groupDuplicateTracks([t(1, 'Track 1'), t(2, 'Track 1'), t(3, 'Untitled'), t(4, 'Untitled')], new Set())
  assert.deepEqual(titleOnly, [])
  const sameMd5 = groupDuplicateTracks([x(1, 'Track 1', { file_hash: 'h' }, 7), x(2, 'Track 1', { file_hash: 'h' }, 8)], new Set())
  assert.equal(sameMd5.length, 1)
})

test('titles that are just a ripper e-mail address are not evidence of a duplicate', () => {
  const groups = groupDuplicateTracks([t(1, 'grimriper2u@yahoo.com'), t(2, 'grimriper2u@yahoo.com'), t(3, 'grimriper2u@yahoo.com')], new Set())
  assert.deepEqual(groups, [])
})

test('same title but very different lengths are different songs; close lengths still group', () => {
  const d = (id: number, title: string, duration_sec: number | null) => ({ ...t(id, title), duration_sec })
  assert.deepEqual(groupDuplicateTracks([d(1, 'Hello World', 180), d(2, 'Hello World', 320)], new Set()), [])
  assert.equal(groupDuplicateTracks([d(1, 'Hello World', 226), d(2, 'Hello World', 227)], new Set()).length, 1)
  assert.equal(groupDuplicateTracks([d(1, 'Hello World', null), d(2, 'Hello World', 227)], new Set()).length, 1)
})

// ---- same recording across albums ----
const onAlbum = (id: number, album_id: number, title: string, extra: Extra = {}, media_file_id: number | null = null) =>
  ({ id, album_id, title, media_file_id, ...extra })

test('the same recording on different albums groups by MusicBrainz id when titles and lengths agree', () => {
  const g = groupDuplicateTracks([
    onAlbum(1, 10, 'The Humpty Dance', { musicbrainz_recording_id: 'm', duration_sec: 313 }, 1),
    onAlbum(2, 20, 'Humpty Dance', { musicbrainz_recording_id: 'm', duration_sec: 314 }, 2),
    onAlbum(3, 30, 'The Humpty Dance', { musicbrainz_recording_id: 'm', duration_sec: 313 }, 3),
  ], new Set())
  assert.equal(g.length, 1)
  assert.deepEqual(g[0].album_ids, [10, 20, 30])
  assert.deepEqual(g[0].reasons, ['musicbrainz'])
})

test('a polluted MusicBrainz id pairing unrelated songs on different albums is not a duplicate', () => {
  const g = groupDuplicateTracks([
    onAlbum(1, 10, 'Private Idaho', { musicbrainz_recording_id: 'm', duration_sec: 211 }, 1),
    onAlbum(2, 20, '52 Girls', { musicbrainz_recording_id: 'm', duration_sec: 212 }, 2),
  ], new Set())
  assert.deepEqual(g, [])
})

test('across albums a MusicBrainz match still needs lengths within a few seconds', () => {
  const g = groupDuplicateTracks([
    onAlbum(1, 10, 'Some Song Here', { musicbrainz_recording_id: 'm', duration_sec: 200 }, 1),
    onAlbum(2, 20, 'Some Song Here', { musicbrainz_recording_id: 'm', duration_sec: 260 }, 2),
  ], new Set())
  assert.deepEqual(g, [])
})

test('identical chromaprint on different albums groups even with different titles, if the bucket is small', () => {
  const small = groupDuplicateTracks([
    onAlbum(1, 10, 'Reels: College Groves', { chromaprint_key: 'fp', duration_sec: 117 }, 1),
    onAlbum(2, 20, 'The College Groves / The Flogging Reel', { chromaprint_key: 'fp', duration_sec: 117 }, 2),
  ], new Set())
  assert.deepEqual(small.map((r) => r.album_ids), [[10, 20]])
  const big = groupDuplicateTracks(
    Array.from({ length: 8 }, (_, i) => onAlbum(i + 1, 10 + i, `Different Song ${i}`, { chromaprint_key: 'fp', duration_sec: 117 }, i + 1)),
    new Set(),
  )
  assert.deepEqual(big, [], 'an oversized fingerprint bucket across albums is a collision')
})

test('title alone never links tracks on different albums', () => {
  const g = groupDuplicateTracks([
    onAlbum(1, 10, 'Hello World Song', { duration_sec: 200 }, 1),
    onAlbum(2, 20, 'Hello World Song', { duration_sec: 200 }, 2),
  ], new Set())
  assert.deepEqual(g, [])
})

test('tracks on different albums that already share one media file are finished, not reported', () => {
  const g = groupDuplicateTracks([
    onAlbum(1, 10, 'The Humpty Dance', { musicbrainz_recording_id: 'm', duration_sec: 313 }, 7),
    onAlbum(2, 20, 'The Humpty Dance', { musicbrainz_recording_id: 'm', duration_sec: 313 }, 7),
  ], new Set())
  assert.deepEqual(g, [])
})

test('a pending group lists every album it spans and still reports same-album duplicates inside it', () => {
  const g = groupDuplicateTracks([
    onAlbum(1, 10, 'Fame', { musicbrainz_recording_id: 'm', duration_sec: 260 }, 1),
    onAlbum(2, 10, 'Fame', { duration_sec: 261 }, 2),
    onAlbum(3, 20, 'Fame', { musicbrainz_recording_id: 'm', duration_sec: 260 }, 3),
  ], new Set())
  assert.equal(g.length, 1)
  assert.deepEqual(g[0].album_ids, [10, 20])
  assert.deepEqual(g[0].tracks.map((tr) => tr.id), [1, 2, 3])
})

test('dismissed pairs are not linked across albums', () => {
  const g = groupDuplicateTracks([
    onAlbum(1, 10, 'The Humpty Dance', { musicbrainz_recording_id: 'm', duration_sec: 313 }, 1),
    onAlbum(2, 20, 'The Humpty Dance', { musicbrainz_recording_id: 'm', duration_sec: 313 }, 2),
  ], new Set(['1-2']))
  assert.deepEqual(g, [])
})

test('never groups across albums and tolerates null titles', () => {
  const groups = groupDuplicateTracks(
    [t(1, 'Song', 1), t(2, 'Song', 2), { id: 3, title: null as unknown as string, album_id: 1, media_file_id: null }],
    new Set(),
  )
  assert.equal(groups.length, 0)
})

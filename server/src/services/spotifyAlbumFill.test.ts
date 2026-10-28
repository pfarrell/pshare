// Pure matching: no network, no database.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { titlesAgree, candidateMatchesAlbum, matchAlbumFill, type LibraryAlbumForFill, type FillCandidate } from './spotifyAlbumFill.js'
import type { SpotifyAlbum, SpotifyTrack } from './spotify.js'

const JAMES_GANG = [
  'Walk Away', "I Don't Have The Time", 'Take A Look Around', 'Funk #48', 'Funk #49', 'Collage', 'Asshtonpark', 'Woman',
  'Tend My Garden', 'The Bomber A: Closet Queen B: Bolero C: Cast Your Fate To The Wind - Medley', 'Laguna Salada',
  'Country Fever', 'Midnight Man', 'Stop - Live At Carnegie Hall / 1971', "You're Gonna Need Me - Live At Carnegie Hall / 1971",
  'Ashes The Rain And I / White Summer',
]

const album = (id: string, name = 'Greatest Hits', releaseYear: string | null = '1973', artists = [{ id: 'jg', name: 'James Gang' }]): SpotifyAlbum => ({
  uri: `spotify:album:${id}`, id, name, artists, releaseYear, totalTracks: null, imageUrl: `https://i/${id}`, externalUrl: null,
})
const track = (albumId: string, name: string, trackNumber: number, discNumber = 1): SpotifyTrack => ({
  uri: `spotify:track:${albumId}-${discNumber}-${trackNumber}`, id: `${albumId}-${discNumber}-${trackNumber}`, name,
  artists: [{ id: 'jg', name: 'James Gang' }], album: { id: albumId, name: 'Greatest Hits', imageUrl: null },
  durationMs: 1000, explicit: false, externalUrl: null, discNumber, trackNumber,
})
const candidate = (id: string, names: string[], opts: { year?: string | null; disc?: number } = {}): FillCandidate => ({
  album: album(id, 'Greatest Hits', opts.year === undefined ? '1973' : opts.year),
  tracks: names.map((n, i) => track(id, n, i + 1, opts.disc ?? 1)),
})
const library = (tracks: { id: number; title: string; trackNumber: string | null }[], extra: Partial<LibraryAlbumForFill> = {}): LibraryAlbumForFill => ({
  title: 'Greatest Hits', artistName: 'James Gang', releaseYear: '1973', discNumber: null, tracks, ...extra,
})

test('titlesAgree accepts a word-boundary prefix', () => {
  assert.equal(titlesAgree('the bomber', 'The Bomber A: Closet Queen B: Bolero C: Cast Your Fate To The Wind - Medley'), true)
  assert.equal(titlesAgree('Funk #4', 'Funk #48'), false)
  assert.equal(titlesAgree('Walk Away', 'Walk Away - Remastered'), true)
  assert.equal(titlesAgree('Woman (Live)', 'woman'), true)
  assert.equal(titlesAgree('', 'x'), false)
  assert.equal(titlesAgree('(Live)', '[Live]'), false)
})

test('James Gang: one library track at 10 fills the other 15 in order', () => {
  const fill = matchAlbumFill(library([{ id: 1, title: 'the bomber', trackNumber: '10' }]), [candidate('gh', JAMES_GANG)])
  assert.ok(fill)
  assert.deepEqual(fill.tracks.map((t) => t.position), [1, 2, 3, 4, 5, 6, 7, 8, 9, 11, 12, 13, 14, 15, 16])
  assert.equal(fill.tracks[0].name, 'Walk Away')
  assert.deepEqual(fill.libraryPositions, { 1: 10 })
  assert.deepEqual(fill.spotifyAlbum, { id: 'gh', name: 'Greatest Hits', imageUrl: 'https://i/gh' })
})

test('a library track at a position whose Spotify title disagrees: no fill', () => {
  assert.equal(matchAlbumFill(library([{ id: 1, title: 'the bomber', trackNumber: '9' }]), [candidate('gh', JAMES_GANG)]), null)
})

test('two passing editions with different track lists: no fill', () => {
  const other = [...JAMES_GANG]
  other[0] = 'Something Else'
  const lib = library([{ id: 1, title: 'the bomber', trackNumber: '10' }])
  assert.equal(matchAlbumFill(lib, [candidate('a', JAMES_GANG), candidate('b', other)]), null)
  assert.equal(matchAlbumFill(lib, [candidate('a', JAMES_GANG), candidate('b', JAMES_GANG.slice(0, 12))]), null)
})

test('two passing editions with the same track list: fill from the first', () => {
  const fill = matchAlbumFill(library([{ id: 1, title: 'the bomber', trackNumber: '10' }]), [candidate('a', JAMES_GANG), candidate('b', JAMES_GANG)])
  assert.equal(fill?.spotifyAlbum.id, 'a')
})

test('the year narrows candidates only when one matches it', () => {
  const lib = library([{ id: 1, title: 'the bomber', trackNumber: '10' }])
  const failing1973 = candidate('old', JAMES_GANG.map((n, i) => (i === 9 ? 'Nope' : n)), { year: '1973' })
  const passing1990 = candidate('new', JAMES_GANG, { year: '1990' })
  assert.equal(matchAlbumFill(lib, [failing1973, passing1990]), null)
  assert.equal(matchAlbumFill(lib, [passing1990])?.spotifyAlbum.id, 'new')
})

test('an unnumbered library track takes the position of its one agreeing title; two agreeing titles: no fill', () => {
  const fill = matchAlbumFill(library([{ id: 7, title: 'Midnight Man', trackNumber: null }]), [candidate('gh', JAMES_GANG)])
  assert.deepEqual(fill?.libraryPositions, { 7: 13 })
  assert.ok(!fill?.tracks.some((t) => t.position === 13))
  assert.equal(matchAlbumFill(library([{ id: 7, title: 'Funk', trackNumber: '' }]), [candidate('gh', ['Funk', 'Funk - Live', 'Other'])]), null)
})

test("'10/16' is position 10", () => {
  const fill = matchAlbumFill(library([{ id: 1, title: 'the bomber', trackNumber: '10/16' }]), [candidate('gh', JAMES_GANG)])
  assert.deepEqual(fill?.libraryPositions, { 1: 10 })
})

test("only the library album's disc is filled", () => {
  const c: FillCandidate = {
    album: album('set'),
    tracks: [track('set', 'One', 1, 1), track('set', 'Two', 2, 1), track('set', 'Three', 1, 2), track('set', 'Four', 2, 2)],
  }
  const fill = matchAlbumFill(library([{ id: 1, title: 'Three', trackNumber: '1' }], { discNumber: 2 }), [c])
  assert.deepEqual(fill?.tracks.map((t) => t.name), ['Four'])
})

test('a complete album, no candidates, and an empty library album all return null', () => {
  const all = JAMES_GANG.map((title, i) => ({ id: i + 1, title, trackNumber: String(i + 1) }))
  assert.equal(matchAlbumFill(library(all), [candidate('gh', JAMES_GANG)]), null)
  assert.equal(matchAlbumFill(library([{ id: 1, title: 'the bomber', trackNumber: '10' }]), []), null)
  assert.equal(matchAlbumFill(library([]), [candidate('gh', JAMES_GANG)]), null)
})

test('candidateMatchesAlbum requires the title and an artist', () => {
  const lib = library([])
  assert.equal(candidateMatchesAlbum(lib, album('a', 'Greatest Hits (Remastered)')), true)
  assert.equal(candidateMatchesAlbum(lib, album('b', 'Greatest Hits', '1973', [{ id: 'jw', name: 'Joe Walsh' }])), false)
  assert.equal(candidateMatchesAlbum(lib, album('c', 'Greatest Hits Live')), false)
  assert.equal(candidateMatchesAlbum(library([], { title: '' }), album('d', '')), false)
})

// Pure matching: no network, no database.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { titlesAgree, candidateMatchesAlbum, matchAlbumFill, narrowByYear, type LibraryAlbumForFill, type FillCandidate } from './spotifyAlbumFill.js'
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

// --- Final review fixes: alternate editions and short unnumbered titles ---

test('candidateMatchesAlbum rejects a live or other version edition unless the library title names it', () => {
  const lib = library([])
  assert.equal(candidateMatchesAlbum(lib, album('l1', 'Greatest Hits - Live')), false)
  assert.equal(candidateMatchesAlbum(lib, album('l2', 'Greatest Hits (Live)')), false)
  assert.equal(candidateMatchesAlbum(lib, album('l3', 'Greatest Hits (Acoustic Version)')), false)
  assert.equal(candidateMatchesAlbum(lib, album('r', 'Greatest Hits (Remastered)')), true)
  assert.equal(candidateMatchesAlbum(library([], { title: 'Greatest Hits (Live)' }), album('l4', 'Greatest Hits - Live')), true)
})

test('two passing editions whose track titles differ only by a version suffix: no fill', () => {
  const lib = library([{ id: 1, title: 'Love', trackNumber: '3' }], { releaseYear: null })
  const studio = candidate('studio', ['A', 'B', 'Love', 'D'])
  const live = candidate('live', ['A - Live', 'B - Live', 'Love - Live', 'D - Live'])
  assert.equal(matchAlbumFill(lib, [live, studio]), null)
})

test('an unnumbered library track needs an equal title, not a prefix', () => {
  assert.equal(matchAlbumFill(library([{ id: 7, title: 'Live', trackNumber: null }]), [candidate('gh', ['Intro', 'Live Forever', 'Outro'])]), null)
  const fill = matchAlbumFill(library([{ id: 7, title: 'Live Forever (Remastered)', trackNumber: null }]), [candidate('gh', ['Intro', 'Live Forever', 'Outro'])])
  assert.deepEqual(fill?.libraryPositions, { 7: 2 })
})

test("a stored year like '1973-01-01' narrows like '1973'", () => {
  const lib = library([{ id: 1, title: 'the bomber', trackNumber: '10' }], { releaseYear: '1973-01-01' })
  const failing1973 = candidate('old', JAMES_GANG.map((n, i) => (i === 9 ? 'Nope' : n)), { year: '1973' })
  const passing1990 = candidate('new', JAMES_GANG, { year: '1990' })
  assert.equal(matchAlbumFill(lib, [failing1973, passing1990]), null)
})

test('narrowByYear keeps same-year items only when there are some', () => {
  const items = [{ y: '1990' }, { y: '1973' }, { y: null }]
  assert.deepEqual(narrowByYear('1973-05-01', items, (i) => i.y), [{ y: '1973' }])
  assert.deepEqual(narrowByYear('1980', items, (i) => i.y), items)
  assert.deepEqual(narrowByYear(null, items, (i) => i.y), items)
})

// --- Dr. John "Duke Elegant" and Daughtry "Daughtry" (library disc_number 0, junk track numbers) ---

const DUKE = ['On the Wrong Side of the Railroad Tracks', "I'm Gonna Go Fishin", "It Don't Mean a Thing (If It Ain't Got That Swing)",
  'Perdido', "Don't Get Around Much Anymore", 'Solitude', 'Satin Doll', 'Mood Indigo', "Do Nothing 'Til You Hear from Me",
  "Things Ain't What They Used to Be", 'Caravan', 'The Flaming Sword']
const DAUGHTRY = ["It's Not Over", 'Used To', 'Home', 'Over You', 'Crashed', 'Feels Like Tonight', 'What I Want (feat. Slash)',
  'Breakdown', 'Gone', 'There And Back Again', 'All These Lives', 'What About Now']
const named = (c: FillCandidate, name: string): FillCandidate => ({ ...c, album: { ...c.album, name } })

test('a library disc_number of 0 means disc 1', () => {
  const lib = library([{ id: 9, title: 'Satin Doll', trackNumber: '07' }], { title: 'Duke Elegant', artistName: 'Dr. John', releaseYear: '1999', discNumber: 0 })
  const fill = matchAlbumFill(lib, [named(candidate('duke', DUKE, { year: '2000' }), 'Duke Elegant')])
  assert.equal(fill?.tracks.length, 11)
  assert.deepEqual(fill?.libraryPositions, { 9: 7 })
})

test('a track number past the end of the release is matched by exact title instead', () => {
  const lib = library([{ id: 1, title: 'Home', trackNumber: '33' }, { id: 2, title: 'Over You', trackNumber: '96' }],
    { title: 'Daughtry', artistName: 'Daughtry', releaseYear: '2006', discNumber: 0 })
  const fill = matchAlbumFill(lib, [named(candidate('std', DAUGHTRY, { year: '2006' }), 'Daughtry')])
  assert.deepEqual(fill?.libraryPositions, { 1: 3, 2: 4 })
  assert.equal(fill?.tracks.length, 10)
  // A number inside the release that disagrees still blocks the fill.
  assert.equal(matchAlbumFill(library([{ id: 1, title: 'Home', trackNumber: '5' }]), [candidate('std', DAUGHTRY)]), null)
})

test('releases whose full title equals the library title win over other editions', () => {
  const lib = library([{ id: 1, title: 'Home', trackNumber: '33' }, { id: 2, title: 'Over You', trackNumber: '96' }],
    { title: 'Daughtry', artistName: 'Daughtry', releaseYear: '2006', discNumber: 0 })
  const deluxe = named(candidate('dlx', [...DAUGHTRY, 'Feels Like The First Time', "It's Not Over - Live", 'Home - Acoustic Version'], { year: '2006' }), 'Daughtry (Deluxe Edition)')
  const standard = named(candidate('std', DAUGHTRY, { year: '2006' }), 'Daughtry')
  assert.equal(matchAlbumFill(lib, [standard, deluxe])?.spotifyAlbum.id, 'std')
  // With no exact-title release, two passing editions that differ still mean no fill.
  const longer = named(candidate('dlx2', [...DAUGHTRY, 'Feels Like The First Time'], { year: '2006' }), 'Daughtry (Deluxe Edition)')
  assert.equal(matchAlbumFill(lib, [named(standard, 'Daughtry (Remastered)'), longer]), null)
})

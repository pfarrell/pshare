// server/src/services/spotifyLibraryMatch.test.ts
// Pure logic only (no database): normalization, the artist relevance filter,
// and mapping candidate rows to localIds. The SQL side is covered by
// spotifyLibraryMatch.db.test.ts.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  normalizeForMatch, isRelevantArtist, filterRelevantArtists, likePatternFor,
  assignLocalIds, withNullLocalIds,
} from './spotifyLibraryMatch.js'
import type { SpotifyAlbum, SpotifyArtist, SpotifySearchResult, SpotifyTrack } from './spotify.js'

const artist = (id: string, name: string): SpotifyArtist => ({ uri: `spotify:artist:${id}`, id, name, imageUrl: null, externalUrl: null })
const album = (id: string, name: string, artistNames: string[]): SpotifyAlbum => ({
  uri: `spotify:album:${id}`, id, name, artists: artistNames.map((n, i) => ({ id: `${id}-a${i}`, name: n })),
  releaseYear: null, totalTracks: null, imageUrl: null, externalUrl: null,
})
const track = (id: string, name: string, artistNames: string[]): SpotifyTrack => ({
  uri: `spotify:track:${id}`, id, name, artists: artistNames.map((n, i) => ({ id: `${id}-a${i}`, name: n })),
  album: { id: 'x', name: 'x', imageUrl: null }, durationMs: 0, explicit: false, externalUrl: null,
})
const empty: SpotifySearchResult = { tracks: [], albums: [], artists: [] }

test('normalizeForMatch lowercases, collapses punctuation/whitespace, trims, keeps non-Latin letters', () => {
  assert.equal(normalizeForMatch('  OK   Computer! '), 'ok computer')
  assert.equal(normalizeForMatch('R.E.M.'), 'r e m')
  assert.equal(normalizeForMatch('AC/DC'), 'ac dc')
  assert.equal(normalizeForMatch('Sigur Rós'), 'sigur rós')
  assert.equal(normalizeForMatch('Ágætis byrjun'), 'ágætis byrjun')
  assert.equal(normalizeForMatch('坂本龍一 — 1996'), '坂本龍一 1996')
  assert.equal(normalizeForMatch('__under_scores__'), 'under scores')
  assert.equal(normalizeForMatch('!!!'), '')
  assert.equal(normalizeForMatch(null), '')
  assert.equal(normalizeForMatch(42), '')
})

test('artist relevance for "radiohead": keeps Radiohead, drops the padding', () => {
  const names = ['Radiohead', 'R.E.M.', 'Bush', 'Muse', 'Thom Yorke', 'RadioTradiX', 'Radio Radio', 'Radio Edit']
  const kept = filterRelevantArtists(names.map((n, i) => artist(String(i), n)), 'radiohead').map((a) => a.name)
  assert.deepEqual(kept, ['Radiohead'])
})

test('artist relevance rules', () => {
  assert.equal(isRelevantArtist('Radiohead Tribute Band', 'radiohead'), true) // name contains query
  assert.equal(isRelevantArtist('Thom Yorke', 'thom yorke radiohead'), true) // query contains name (whole words)
  assert.equal(isRelevantArtist('Radio', 'radiohead'), false) // ...but not as a substring of a word
  assert.equal(isRelevantArtist('The Smashing Pumpkins', 'pumpkins smashing'), true) // every token a whole word
  assert.equal(isRelevantArtist('The The', '"The The"'), true)
  assert.equal(isRelevantArtist('Sigur Rós', 'sigur ros'), true) // diacritics folded for relevance
  assert.equal(isRelevantArtist('Anyone', '!!!'), true) // nothing to compare against: keep
  assert.equal(isRelevantArtist('', 'radiohead'), false)
})

test('likePatternFor builds a superset ILIKE pattern from the normalized tokens', () => {
  assert.equal(likePatternFor('OK Computer'), '%ok%computer%')
  assert.equal(likePatternFor('100% _Pure_'), '%100%pure%')
  assert.equal(likePatternFor('...'), null)
})

test('assignLocalIds matches artists by normalized name, smallest id wins', () => {
  const out = assignLocalIds(
    { ...empty, artists: [artist('a', 'Radiohead'), artist('b', 'Muse'), artist('c', '!!!')] },
    { artists: [{ id: 9, name: 'radiohead' }, { id: 4, name: 'RADIOHEAD.' }, { id: 5, name: 'Radioheads' }, { id: 6, name: '???' }], albums: [], tracks: [] },
  )
  assert.deepEqual(out.artists.map((a) => a.localId), [4, null, null])
  assert.equal(out.artists[0].name, 'Radiohead') // original fields preserved
})

test('assignLocalIds matches albums on title + any Spotify album artist', () => {
  const out = assignLocalIds(
    { ...empty, albums: [
      album('1', 'OK Computer', ['Radiohead']),
      album('2', 'Kid A', ['Someone Else', 'Radiohead']),
      album('3', 'OK Computer', ['A Cover Band']),
      album('4', 'Amnesiac', ['Radiohead']),
    ] },
    { artists: [], tracks: [], albums: [
      { id: 10, title: 'OK Computer', artist_name: 'Radiohead' },
      { id: 11, title: 'Kid A', artist_name: 'radiohead' },
      { id: 12, title: 'Amnesiac (Collector’s Edition)', artist_name: 'Radiohead' },
    ] },
  )
  assert.deepEqual(out.albums.map((a) => a.localId), [10, 11, null, null])
})

test('assignLocalIds matches tracks on title + artist', () => {
  const out = assignLocalIds(
    { ...empty, tracks: [track('1', 'Paranoid Android', ['Radiohead']), track('2', 'Paranoid Android', ['Brad Mehldau'])] },
    { artists: [], albums: [], tracks: [{ id: 77, title: 'Paranoid android', artist_name: 'Radiohead' }] },
  )
  assert.deepEqual(out.tracks.map((t) => t.localId), [77, null])
})

test('withNullLocalIds adds localId: null everywhere', () => {
  const out = withNullLocalIds({ tracks: [track('t', 'T', ['A'])], albums: [album('b', 'B', ['A'])], artists: [artist('c', 'C')] })
  assert.equal(out.tracks[0].localId, null)
  assert.equal(out.albums[0].localId, null)
  assert.equal(out.artists[0].localId, null)
})

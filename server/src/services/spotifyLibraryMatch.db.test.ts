// server/src/services/spotifyLibraryMatch.db.test.ts
// DB-backed: exercises the real candidate SQL against throwaway fixture rows.
import 'dotenv/config'
import { test, after } from 'node:test'
import assert from 'node:assert/strict'
import { db } from '../db/database.js'
import { createArtist, createAlbum, createTrack, cleanupFixtures, fixtureName } from '../test/fixtures.js'
import { spotifyLibraryMatcher } from './spotifyLibraryMatch.js'
import type { SpotifySearchResult } from './spotify.js'

after(cleanupFixtures)

const refs = (names: string[]) => names.map((name, i) => ({ id: `a${i}`, name }))
const spotifyArtist = (name: string) => ({ uri: '', id: name, name, imageUrl: null, externalUrl: null })
const spotifyAlbum = (name: string, artists: string[]) => ({
  uri: '', id: name, name, artists: refs(artists), releaseYear: null, totalTracks: null, imageUrl: null, externalUrl: null,
})
const spotifyTrack = (name: string, artists: string[]) => ({
  uri: '', id: name, name, artists: refs(artists), album: { id: '', name: '', imageUrl: null }, durationMs: 0, explicit: false, externalUrl: null,
})

test('annotate finds artists, albums (primary or artist_albums credit) and approved tracks across the library', async () => {
  const band = await createArtist('lib-band')
  const guest = await createArtist('lib-guest')
  const owned = await createAlbum('lib-owned-album', band.id)
  const credited = await createAlbum('lib-credited-album', band.id)
  await db.insertInto('artist_albums').values({ artist_id: guest.id, album_id: credited.id, role: 'featured', order: 1 }).execute()
  const song = await createTrack('lib-song', owned.id, band.id)
  await createTrack('lib-credited-song', credited.id, band.id)
  const pending = await createTrack('lib-pending-song', owned.id, band.id)
  await db.updateTable('tracks').set({ approved: false }).where('id', '=', pending.id).execute()

  // Spotify spells names differently: upper case, spaces instead of the fixture's underscores.
  const loud = (label: string) => fixtureName(label).toUpperCase().replace(/_/g, ' ')
  const result: SpotifySearchResult = {
    artists: [spotifyArtist(loud('lib-band')), spotifyArtist(fixtureName('lib-missing'))],
    albums: [
      spotifyAlbum(loud('lib-owned-album'), [loud('lib-band')]),
      spotifyAlbum(fixtureName('lib-credited-album'), [fixtureName('lib-guest')]), // via artist_albums
      spotifyAlbum(fixtureName('lib-owned-album'), [fixtureName('lib-guest')]), // right title, wrong artist
    ],
    tracks: [
      spotifyTrack(fixtureName('lib-song'), ['Someone', fixtureName('lib-band')]),
      spotifyTrack(fixtureName('lib-pending-song'), [fixtureName('lib-band')]), // approved = false
    ],
  }

  const out = await spotifyLibraryMatcher.annotate(result)
  assert.deepEqual(out.artists.map((a) => a.localId), [band.id, null])
  assert.deepEqual(out.albums.map((a) => a.localId), [owned.id, credited.id, null])
  assert.deepEqual(out.tracks.map((t) => t.localId), [song.id, null])
})

// Stub rows (no approved tracks) don't appear in local search, so they must not
// hide the Spotify result either — otherwise the artist shows up nowhere ("sza").
test('annotate ignores artists and albums with no approved tracks', async () => {
  const stub = await createArtist('lib-stub')
  await createAlbum('lib-empty-album', stub.id)
  const pendingOnly = await createAlbum('lib-pending-album', stub.id)
  const pending = await createTrack('lib-pending-only', pendingOnly.id, stub.id)
  await db.updateTable('tracks').set({ approved: false }).where('id', '=', pending.id).execute()
  const solo = await createArtist('lib-solo')
  const host = await createArtist('lib-host')
  const hostAlbum = await createAlbum('lib-host-album', host.id)
  await createTrack('lib-solo-song', hostAlbum.id, solo.id) // via tracks.artist_id only

  const out = await spotifyLibraryMatcher.annotate({
    artists: [spotifyArtist(fixtureName('lib-stub')), spotifyArtist(fixtureName('lib-solo'))],
    albums: [
      spotifyAlbum(fixtureName('lib-empty-album'), [fixtureName('lib-stub')]),
      spotifyAlbum(fixtureName('lib-pending-album'), [fixtureName('lib-stub')]),
    ],
    tracks: [],
  })
  assert.deepEqual(out.artists.map((a) => a.localId), [null, solo.id])
  assert.deepEqual(out.albums.map((a) => a.localId), [null, null])
})

test('annotate on an empty result returns empty lists', async () => {
  assert.deepEqual(await spotifyLibraryMatcher.annotate({ tracks: [], albums: [], artists: [] }), { tracks: [], albums: [], artists: [] })
})

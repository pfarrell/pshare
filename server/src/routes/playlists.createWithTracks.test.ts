import 'dotenv/config'
import { test, after } from 'node:test'
import assert from 'node:assert/strict'
import { db } from '../db/database.js'
import { createPlaylistWithTracks, resolvePlaylistTrackIds, MAX_PLAYLIST_TRACKS } from './playlists.js'
import { createUser, createArtist, createAlbum, createTrack, cleanupFixtures, fixtureName } from '../test/fixtures.js'

// cleanupFixtures deletes playlists (by fixture-prefixed name) but not their
// playlist_tracks rows first — harmless (no FK on playlist_tracks.playlist_id
// per this schema) but leaves orphaned rows behind, so this test's own
// playlist_tracks are cleaned explicitly before the shared cleanup runs.
after(async () => {
  const prefix = fixtureName('')
  const ids = (await db.selectFrom('playlists').select('id').where('name', 'like', `${prefix}%`).execute()).map((r) => r.id)
  if (ids.length > 0) await db.deleteFrom('playlist_tracks').where('playlist_id', 'in', ids).execute()
  await cleanupFixtures()
})

test('resolvePlaylistTrackIds filters to integers and returns an empty array for non-array input', () => {
  assert.deepEqual(resolvePlaylistTrackIds([1, 'two', 3.5, null, 4]), [1, 4])
  assert.deepEqual(resolvePlaylistTrackIds('not an array'), [])
  assert.deepEqual(resolvePlaylistTrackIds(undefined), [])
})

test('resolvePlaylistTrackIds caps at the max track count', () => {
  const ids = Array.from({ length: MAX_PLAYLIST_TRACKS + 10 }, (_, i) => i + 1)
  const result = resolvePlaylistTrackIds(ids)
  assert.equal(result.length, MAX_PLAYLIST_TRACKS)
  assert.deepEqual(result, ids.slice(0, MAX_PLAYLIST_TRACKS))
})

test('createPlaylistWithTracks creates a playlist owned by the given user', async () => {
  const user = await createUser('create-with-tracks-owner')
  const playlist = await createPlaylistWithTracks(user.id, 'My Playlist', [])
  assert.equal(playlist.user_id, user.id)
  assert.equal(playlist.name, 'My Playlist')
})

test('createPlaylistWithTracks inserts the given tracks in order', async () => {
  const user = await createUser('create-with-tracks-order-user')
  const artist = await createArtist('create-with-tracks-artist')
  const album = await createAlbum('create-with-tracks-album', artist.id)
  const trackA = await createTrack('create-with-tracks-track-a', album.id, artist.id)
  const trackB = await createTrack('create-with-tracks-track-b', album.id, artist.id)

  const playlist = await createPlaylistWithTracks(user.id, 'Ordered', [trackB.id, trackA.id])

  const rows = await db
    .selectFrom('playlist_tracks')
    .select(['track_id', 'order'])
    .where('playlist_id', '=', playlist.id)
    .orderBy('order', 'asc')
    .execute()
  assert.deepEqual(rows.map((r) => r.track_id), [trackB.id, trackA.id])
  assert.deepEqual(rows.map((r) => r.order), [1, 2])
})

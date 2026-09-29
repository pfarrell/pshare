import 'dotenv/config'
import { test, after } from 'node:test'
import assert from 'node:assert/strict'
import { db } from '../db/database.js'
import { createPlaylist, createArtist, createAlbum, createTrack, cleanupFixtures } from '../test/fixtures.js'
import { logService } from './logService.js'

after(cleanupFixtures)

test('resolvePlaylistId returns the id of an existing playlist', async () => {
  const playlist = await createPlaylist('log-resolve-existing')
  assert.equal(await logService.resolvePlaylistId(String(playlist.id)), playlist.id)
})

test('resolvePlaylistId returns null for missing, malformed, or unknown values', async () => {
  const playlist = await createPlaylist('log-resolve-deleted')
  await db.deleteFrom('playlists').where('id', '=', playlist.id).execute()
  for (const raw of [undefined, '', 'abc', '-1', '1.5', '0', ' 7', '99999999999999999999', String(playlist.id)]) {
    assert.equal(await logService.resolvePlaylistId(raw), null, `raw=${String(raw)}`)
  }
})

test('record stores playlist_id when given, and null otherwise', async () => {
  const playlist = await createPlaylist('log-record')
  const artist = await createArtist('log-record-artist')
  const album = await createAlbum('log-record-album', artist.id)
  const track = await createTrack('log-record-track', album.id, artist.id)
  const base = { track_id: track.id, album_id: album.id, artist_id: artist.id, action: 'stream', created_at: new Date(), ip_address: null }

  await logService.record({ ...base, playlist_id: playlist.id })
  await logService.record(base)

  const rows = await db.selectFrom('logs').select('playlist_id').where('track_id', '=', track.id).execute()
  assert.equal(rows.length, 2)
  assert.equal(rows.filter((r) => r.playlist_id === playlist.id).length, 1)
  assert.equal(rows.filter((r) => r.playlist_id === null).length, 1)
})

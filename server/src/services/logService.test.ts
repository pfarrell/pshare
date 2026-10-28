import 'dotenv/config'
import { test, after } from 'node:test'
import assert from 'node:assert/strict'
import { db } from '../db/database.js'
import { createPlaylist, createArtist, createAlbum, createTrack, cleanupFixtures } from '../test/fixtures.js'
import { logService, parseLogSource } from './logService.js'

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

// --- Admin log list: P·Share logs and Spotify plays mixed by time (#72) ---
// Rows are dated 2099 so they sort ahead of anything else in the dev database,
// and carry a marker IP so they can be removed afterwards.
const MARKER_IP = '203.0.113.77'
const at = (day: number) => new Date(Date.UTC(2099, 0, day))

async function seedMixedLog() {
  await db.insertInto('logs').values([
    { action: 'stream', created_at: at(1), ip_address: MARKER_IP, track_id: null, album_id: null, artist_id: null },
    { action: 'search', query: 'zz mixed query', created_at: at(3), ip_address: MARKER_IP, track_id: null, album_id: null, artist_id: null },
  ]).execute()
  await db.insertInto('spotify_plays').values({
    track_uri: 'spotify:track:zzmixed', track_name: 'Flower In A Hurricane', artist_name: 'Justice',
    album_spotify_id: 'r1', album_name: 'Flower In A Hurricane', album_image_url: null,
    user_id: null, ip_address: MARKER_IP, created_at: at(2),
  }).execute()
}

async function removeMixedLog() {
  await db.deleteFrom('logs').where('ip_address', '=', MARKER_IP).execute()
  await db.deleteFrom('spotify_plays').where('ip_address', '=', MARKER_IP).execute()
}

test('listPage mixes P·Share logs and Spotify plays, newest first, each tagged with its source', async () => {
  await removeMixedLog()
  await seedMixedLog()
  try {
    const rows = await logService.listPage(3, 0, 'all')
    assert.deepEqual(rows.map((r) => [r.source, r.action]), [['library', 'search'], ['spotify', 'spotify'], ['library', 'stream']])
    const play = rows[1]
    assert.equal(play.track_title, 'Flower In A Hurricane')
    assert.equal(play.artist_name, 'Justice')
    assert.equal(play.album_title, 'Flower In A Hurricane')
    assert.equal(play.album_spotify_id, 'r1')
    assert.equal(play.ip_address, MARKER_IP)
    assert.equal(play.track_id, null)
    assert.equal(rows[0].query, 'zz mixed query')
  } finally {
    await removeMixedLog()
  }
})

test('listPage and countAll filter by source', async () => {
  await removeMixedLog()
  await seedMixedLog()
  try {
    assert.deepEqual((await logService.listPage(1, 0, 'spotify')).map((r) => r.source), ['spotify'])
    assert.deepEqual((await logService.listPage(2, 0, 'library')).map((r) => r.action), ['search', 'stream'])
    const [all, library, spotify] = await Promise.all(['all', 'library', 'spotify'].map((s) => logService.countAll(s as any)))
    assert.ok(spotify >= 1 && library >= 2)
    assert.equal(all, library + spotify)
  } finally {
    await removeMixedLog()
  }
})

test('parseLogSource accepts library and spotify, anything else is all', () => {
  assert.equal(parseLogSource('library'), 'library')
  assert.equal(parseLogSource('spotify'), 'spotify')
  for (const raw of [undefined, '', 'all', 'Spotify', 'logs']) assert.equal(parseLogSource(raw), 'all')
})

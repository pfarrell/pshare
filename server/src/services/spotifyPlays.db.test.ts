// server/src/services/spotifyPlays.db.test.ts
// DB-backed: real inserts into spotify_plays, removed afterwards.
import 'dotenv/config'
import { test, after } from 'node:test'
import assert from 'node:assert/strict'
import { db } from '../db/database.js'
import { spotifyPlays, parseSpotifyPlay } from './spotifyPlays.js'

const ALBUM_A = 'zzTestAlbumA'
const ALBUM_B = 'zzTestAlbumB'
after(async () => {
  await db.deleteFrom('spotify_plays').where('track_uri', 'like', 'spotify:track:zzTest%').execute()
})

const play = (n: number, album: string | null, name = `Album ${album}`) =>
  parseSpotifyPlay({ trackUri: `spotify:track:zzTest${n}`, trackName: `T${n}`, artistName: 'SZA', albumSpotifyId: album, albumName: name, albumImageUrl: 'https://i.scdn.co/x' })!

test('recentAlbums: one row per album, newest play first, details from the latest play', async () => {
  const meta = { userId: null, ipAddress: '127.0.0.1' }
  await spotifyPlays.record(play(1, ALBUM_A, 'Old name'), meta)
  await spotifyPlays.record(play(2, ALBUM_B), meta)
  await spotifyPlays.record(play(3, null), meta) // no album: never listed
  await spotifyPlays.record(play(4, ALBUM_A, 'SOS'), meta)

  const recent = (await spotifyPlays.recentAlbums(50)).filter((a) => a.id.startsWith('zzTest'))
  assert.deepEqual(recent.map((a) => [a.id, a.name]), [[ALBUM_A, 'SOS'], [ALBUM_B, `Album ${ALBUM_B}`]])
  assert.equal(recent[0].artistName, 'SZA')
  assert.equal(recent[0].imageUrl, 'https://i.scdn.co/x')
})

// server/src/services/spotifyPlays.test.ts
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { parseSpotifyPlay } from './spotifyPlays.js'

test('parseSpotifyPlay rejects anything that is not a Spotify track uri', () => {
  assert.equal(parseSpotifyPlay(null), null)
  assert.equal(parseSpotifyPlay({}), null)
  assert.equal(parseSpotifyPlay({ trackUri: 'spotify:album:abc' }), null)
  assert.equal(parseSpotifyPlay({ trackUri: 'spotify:track:a/b' }), null)
})

test('parseSpotifyPlay keeps valid fields and degrades bad optional ones', () => {
  assert.deepEqual(parseSpotifyPlay({
    trackUri: 'spotify:track:abc', trackName: 'Snooze', artistName: 'SZA',
    albumSpotifyId: 'sos1', albumName: 'SOS', albumImageUrl: 'https://i.scdn.co/img',
  }), {
    trackUri: 'spotify:track:abc', trackName: 'Snooze', artistName: 'SZA',
    albumSpotifyId: 'sos1', albumName: 'SOS', albumImageUrl: 'https://i.scdn.co/img',
  })
  const degraded = parseSpotifyPlay({ trackUri: 'spotify:track:abc', albumSpotifyId: 'x-y', albumImageUrl: 'javascript:alert(1)', trackName: 7 })
  assert.deepEqual(degraded, {
    trackUri: 'spotify:track:abc', trackName: '', artistName: '', albumSpotifyId: null, albumName: '', albumImageUrl: null,
  })
  assert.equal(parseSpotifyPlay({ trackUri: 'spotify:track:abc', albumName: 'x'.repeat(900) })!.albumName.length, 500)
})

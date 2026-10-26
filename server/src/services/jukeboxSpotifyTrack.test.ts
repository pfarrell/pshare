import { test } from 'node:test'
import assert from 'node:assert/strict'
import { parseGuestSpotifyTrack } from './jukeboxSpotifyTrack.js'

test('parseGuestSpotifyTrack rejects anything that is not a Spotify track', () => {
  for (const raw of [null, 'x', {}, { uri: 'spotify:album:a' }, { uri: 'spotify:track:a/b' }, { uri: 5 }]) {
    assert.equal(parseGuestSpotifyTrack(raw), null, JSON.stringify(raw))
  }
})

test('parseGuestSpotifyTrack keeps the queue-entry fields and drops the rest', () => {
  assert.deepEqual(parseGuestSpotifyTrack({
    uri: 'spotify:track:abc', id: 'abc', name: 'Snooze', localId: 4, externalUrl: 'https://x',
    artists: [{ id: 'z', name: 'SZA' }, { bogus: true }],
    album: { id: 'sos', name: 'SOS', imageUrl: 'https://i.scdn.co/sos' },
    durationMs: 201800.4,
  }), {
    uri: 'spotify:track:abc', id: 'abc', name: 'Snooze',
    artists: [{ name: 'SZA' }],
    album: { id: 'sos', name: 'SOS', imageUrl: 'https://i.scdn.co/sos' },
    durationMs: 201800,
  })
})

test('parseGuestSpotifyTrack degrades bad optional fields', () => {
  assert.deepEqual(parseGuestSpotifyTrack({
    uri: 'spotify:track:abc', id: 'a-b', name: 7, artists: 'SZA',
    album: { id: 'x/y', imageUrl: 'javascript:alert(1)' }, durationMs: 'long',
  }), {
    uri: 'spotify:track:abc', id: 'abc', name: '', artists: [],
    album: { id: null, name: '', imageUrl: null }, durationMs: 0,
  })
  assert.equal(parseGuestSpotifyTrack({ uri: 'spotify:track:abc', name: 'x'.repeat(900) })!.name.length, 300)
})

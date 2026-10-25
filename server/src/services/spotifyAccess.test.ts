import { test, afterEach } from 'node:test'
import assert from 'node:assert/strict'
import { isSpotifyAllowedUser } from './spotifyAccess.js'

const original = process.env.SPOTIFY_ALLOWED_USER_IDS
afterEach(() => {
  if (original === undefined) delete process.env.SPOTIFY_ALLOWED_USER_IDS
  else process.env.SPOTIFY_ALLOWED_USER_IDS = original
})

test('unset allowlist allows nobody', () => {
  delete process.env.SPOTIFY_ALLOWED_USER_IDS
  assert.equal(isSpotifyAllowedUser(3), false)
  process.env.SPOTIFY_ALLOWED_USER_IDS = ''
  assert.equal(isSpotifyAllowedUser(3), false)
})

test('comma-separated list tolerates spaces and is read on every call', () => {
  process.env.SPOTIFY_ALLOWED_USER_IDS = '3, 7'
  assert.equal(isSpotifyAllowedUser(7), true)
  assert.equal(isSpotifyAllowedUser(8), false)
  process.env.SPOTIFY_ALLOWED_USER_IDS = '8'
  assert.equal(isSpotifyAllowedUser(8), true)
})

test('null and undefined are never allowed', () => {
  process.env.SPOTIFY_ALLOWED_USER_IDS = '3'
  assert.equal(isSpotifyAllowedUser(null), false)
  assert.equal(isSpotifyAllowedUser(undefined), false)
})

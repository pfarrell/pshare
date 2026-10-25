// Pure in-memory cache; no database, no network.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createSpotifyArtistAlbumsCache } from './spotifyArtistAlbumsCache.js'

const entry = (name: string) => ({ spotifyArtist: { id: name, name }, albums: [] })

test('returns a stored entry before ttl and undefined after', () => {
  let now = 1000
  const cache = createSpotifyArtistAlbumsCache({ ttlMs: 100, maxEntries: 10, now: () => now })
  cache.set(1, entry('a'))
  now = 1099
  assert.equal(cache.get(1)?.spotifyArtist?.name, 'a')
  now = 1100
  assert.equal(cache.get(1), undefined)
})

test('evicts the least recently used past maxEntries', () => {
  const cache = createSpotifyArtistAlbumsCache({ ttlMs: 1000, maxEntries: 2, now: () => 0 })
  cache.set(1, entry('a'))
  cache.set(2, entry('b'))
  cache.get(1) // 1 is now most recently used
  cache.set(3, entry('c'))
  assert.equal(cache.get(2), undefined)
  assert.ok(cache.get(1))
  assert.ok(cache.get(3))
})

test('caches a null spotifyArtist entry', () => {
  const cache = createSpotifyArtistAlbumsCache({ ttlMs: 1000, maxEntries: 2, now: () => 0 })
  cache.set(9, { spotifyArtist: null, albums: [] })
  assert.deepEqual(cache.get(9), { spotifyArtist: null, albums: [] })
})

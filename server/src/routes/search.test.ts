import 'dotenv/config'
import { test, after } from 'node:test'
import assert from 'node:assert/strict'
import { Hono } from 'hono'
import search from './search.js'
import { createTag, createProfile, createArtist, createAlbum, createTrack, createPlaylist, tagAlbum, cleanupFixtures } from '../test/fixtures.js'

after(cleanupFixtures)

// search.ts itself has no requireAuth call — auth is applied one layer up,
// by index.ts's protectedApp wrapper — so a standalone mount here just needs
// a user set in context, matching the pattern used by artists.test.ts /
// profiles.test.ts for the same reason.
const appWithUser = (user: any = { id: 1, admin: false }) => {
  const app = new Hono()
  app.use('*', async (c, next) => { if (user) c.set('user' as never, user as never); await next() })
  app.route('/search', search)
  return app
}

// An unrecognized profileId is "no match", never an error — matching
// /albums/random, /albums/recent and /artists/random. It filters out
// albums/artists/tracks but must leave playlists/collections alone, since
// those have no tag concept.
async function seedTaggableAndUntaggable(label: string, substring: string) {
  const artist = await createArtist(`${label}-artist`)
  const album = await createAlbum(`${label}-album-${substring}`, artist.id)
  await createTrack(`${label}-track`, album.id, artist.id)
  const playlist = await createPlaylist(`${label}-playlist-${substring}`)
  return { album, playlist }
}

test('GET /search?profileId= for a nonexistent profile returns 200, dropping albums but keeping playlists', async () => {
  const { album, playlist } = await seedTaggableAndUntaggable('search-route-noprofile', 'zzzroutenoprofile')

  const res = await appWithUser().request('/search?q=zzzroutenoprofile&profileId=999999999')

  assert.equal(res.status, 200)
  const body = await res.json()
  assert.ok(body.results.some((r: any) => r.type === 'playlist' && r.data.id === playlist.id))
  assert.equal(body.results.some((r: any) => r.type === 'album' && r.data.id === album.id), false)
})

test('GET /search?profileId= with a non-numeric value returns 200, dropping albums but keeping playlists', async () => {
  const { album, playlist } = await seedTaggableAndUntaggable('search-route-nanprofile', 'zzzroutenanprofile')

  const res = await appWithUser().request('/search?q=zzzroutenanprofile&profileId=not-a-number')

  assert.equal(res.status, 200)
  const body = await res.json()
  assert.ok(body.results.some((r: any) => r.type === 'playlist' && r.data.id === playlist.id))
  assert.equal(body.results.some((r: any) => r.type === 'album' && r.data.id === album.id), false)
  assert.deepEqual(body.tracks, [])
})

test('GET /search?profileId= for a real profile returns only albums carrying one of its tags', async () => {
  const tag = await createTag('search-route-profile-tag')
  const profile = await createProfile('search-route-profile', [tag.id])
  const artist = await createArtist('search-route-profile-artist')
  const tagged = await createAlbum('search-route-profile-tagged-zzzrouteprofile', artist.id)
  const untagged = await createAlbum('search-route-profile-untagged-zzzrouteprofile', artist.id)
  await createTrack('search-route-profile-tagged-track', tagged.id, artist.id)
  await createTrack('search-route-profile-untagged-track', untagged.id, artist.id)
  await tagAlbum(tagged.id, tag.id)

  const res = await appWithUser().request(`/search?q=zzzrouteprofile&profileId=${profile.id}`)

  assert.equal(res.status, 200)
  const body = await res.json()
  assert.ok(body.results.some((r: any) => r.type === 'album' && r.data.id === tagged.id))
  assert.equal(body.results.some((r: any) => r.type === 'album' && r.data.id === untagged.id), false)
})

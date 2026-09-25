// server/src/services/albumsService.test.ts
import 'dotenv/config'
import { test, after } from 'node:test'
import assert from 'node:assert/strict'
import { db } from '../db/database.js'
import { createArtist, createAlbum, createTrack, createLog, cleanupFixtures } from '../test/fixtures.js'
import { createTag, tagAlbum } from '../test/fixtures.js'
import { albumsService } from './albumsService.js'

after(cleanupFixtures)

test('recentlyPlayed orders by most recent play and dedups by album', async () => {
  const artist = await createArtist('recent-artist')
  const albumA = await createAlbum('recent-album-a', artist.id)
  const albumB = await createAlbum('recent-album-b', artist.id)
  // recentlyPlayed requires image_path to be set, same eligibility filter as randomAll.
  await db.updateTable('albums').set({ image_path: '/fixture.jpg' }).where('id', 'in', [albumA.id, albumB.id]).execute()
  const trackA = await createTrack('recent-track-a', albumA.id, artist.id)
  const trackB = await createTrack('recent-track-b', albumB.id, artist.id)

  // Relative to now, not fixed calendar dates: recentlyPlayed(50) reads the
  // whole (shared) dev database with no fixture isolation, so fixtures pinned
  // to a past date eventually fall out of the LIMIT 50 window as real plays
  // accumulate. The relative ordering below is the same one the assertion
  // depends on.
  const DAY = 86400000
  await createLog(albumA.id, trackA.id, artist.id, new Date(Date.now() - 3 * DAY))
  await createLog(albumB.id, trackB.id, artist.id, new Date(Date.now() - 1 * DAY))
  await createLog(albumA.id, trackA.id, artist.id, new Date(Date.now() - 2 * DAY))

  const rows = (await albumsService.recentlyPlayed(50)).rows as any[]
  const relevantIds = rows.map((r) => r.id).filter((id) => id === albumA.id || id === albumB.id)

  // Album B's only play (1 day ago) is more recent than album A's most recent
  // play (2 days ago), and A appears exactly once despite two logged plays.
  assert.deepEqual(relevantIds, [albumB.id, albumA.id])
})

test('recentlyPlayed excludes albums with no image_path', async () => {
  const artist = await createArtist('recent-no-image-artist')
  const album = await createAlbum('recent-no-image-album', artist.id)
  const track = await createTrack('recent-no-image-track', album.id, artist.id)
  await createLog(album.id, track.id, artist.id, new Date())

  const rows = (await albumsService.recentlyPlayed(50)).rows as any[]
  assert.equal(rows.some((r) => r.id === album.id), false)
})

test('randomByTagIds only returns albums tagged with one of the given tag ids', async () => {
  const artist = await createArtist('tagids-artist')
  const matching = await createAlbum('tagids-matching', artist.id)
  const nonMatching = await createAlbum('tagids-nonmatching', artist.id)
  await db.updateTable('albums').set({ image_path: '/fixture.jpg' }).where('id', 'in', [matching.id, nonMatching.id]).execute()
  await createTrack('tagids-matching-track', matching.id, artist.id)
  await createTrack('tagids-nonmatching-track', nonMatching.id, artist.id)
  const tag = await createTag('tagids-tag')
  await tagAlbum(matching.id, tag.id)

  const rows = (await albumsService.randomByTagIds([tag.id], 50)).rows as any[]
  const ids = rows.map((r) => r.id)

  assert.ok(ids.includes(matching.id))
  assert.equal(ids.includes(nonMatching.id), false)
})

test('randomByTagIds returns nothing for an empty tag id list', async () => {
  const rows = (await albumsService.randomByTagIds([], 50)).rows as any[]
  assert.equal(rows.length, 0)
})

test('recentlyPlayed with tagIds only returns albums tagged with one of them', async () => {
  const artist = await createArtist('recent-tagids-artist')
  const matching = await createAlbum('recent-tagids-matching', artist.id)
  const nonMatching = await createAlbum('recent-tagids-nonmatching', artist.id)
  await db.updateTable('albums').set({ image_path: '/fixture.jpg' }).where('id', 'in', [matching.id, nonMatching.id]).execute()
  const trackA = await createTrack('recent-tagids-matching-track', matching.id, artist.id)
  const trackB = await createTrack('recent-tagids-nonmatching-track', nonMatching.id, artist.id)
  await createLog(matching.id, trackA.id, artist.id, new Date())
  await createLog(nonMatching.id, trackB.id, artist.id, new Date())
  const tag = await createTag('recent-tagids-tag')
  await tagAlbum(matching.id, tag.id)

  const rows = (await albumsService.recentlyPlayed(50, [tag.id])).rows as any[]
  const ids = rows.map((r) => r.id)

  assert.ok(ids.includes(matching.id))
  assert.equal(ids.includes(nonMatching.id), false)
})

test('recentlyPlayed with an empty tagIds array returns nothing', async () => {
  const rows = (await albumsService.recentlyPlayed(50, [])).rows as any[]
  assert.equal(rows.length, 0)
})

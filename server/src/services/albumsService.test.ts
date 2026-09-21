// server/src/services/albumsService.test.ts
import 'dotenv/config'
import { test, after } from 'node:test'
import assert from 'node:assert/strict'
import { db } from '../db/database.js'
import { createArtist, createAlbum, createTrack, createLog, cleanupFixtures } from '../test/fixtures.js'
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

  await createLog(albumA.id, trackA.id, artist.id, new Date('2026-01-01T00:00:00Z'))
  await createLog(albumB.id, trackB.id, artist.id, new Date('2026-01-03T00:00:00Z'))
  await createLog(albumA.id, trackA.id, artist.id, new Date('2026-01-02T00:00:00Z'))

  const rows = (await albumsService.recentlyPlayed(50)).rows as any[]
  const relevantIds = rows.map((r) => r.id).filter((id) => id === albumA.id || id === albumB.id)

  // Album B's only play (Jan 3) is more recent than album A's most recent
  // play (Jan 2), and A appears exactly once despite two logged plays.
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

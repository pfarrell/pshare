import 'dotenv/config'
import { test, after } from 'node:test'
import assert from 'node:assert/strict'
import { createArtist, createAlbum, createTrack, createTag, tagAlbum, tagArtist, tagTrack, cleanupFixtures } from '../test/fixtures.js'
import { searchService } from './searchService.js'

after(cleanupFixtures)

test('runUnionSearch with tagIds only matches albums/artists carrying one of those tags', async () => {
  const artist = await createArtist('search-tagids-artist')
  const matchingAlbum = await createAlbum('search-tagids-matching-zzzunique', artist.id)
  const nonMatchingAlbum = await createAlbum('search-tagids-nonmatching-zzzunique', artist.id)
  await createTrack('search-tagids-matching-track', matchingAlbum.id, artist.id)
  await createTrack('search-tagids-nonmatching-track', nonMatchingAlbum.id, artist.id)
  const tag = await createTag('search-tagids-tag')
  await tagAlbum(matchingAlbum.id, tag.id)

  const rows = await searchService.runUnionSearch('%zzzunique%', 'zzzunique', false, 30, 0, [tag.id])
  const albumRows = rows.filter((r: any) => r.model_type === 'Album')
  const ids = albumRows.map((r: any) => r.id)

  assert.ok(ids.includes(matchingAlbum.id))
  assert.equal(ids.includes(nonMatchingAlbum.id), false)
})

test('runUnionSearch with an empty tagIds array matches nothing', async () => {
  const rows = await searchService.runUnionSearch('%a%', 'a', false, 30, 0, [])
  assert.equal(rows.length, 0)
})

test('runUnionSearch never filters Playlist/Collection results by tagIds', async () => {
  // Playlists/collections have no tag concept — same rows come back whether
  // tagIds is null or an array that matches nothing else, as long as the
  // playlist/collection name itself matches the query. This is a smoke
  // check that the tag join was only added to the Album/Artist branches.
  const unfiltered = await searchService.runUnionSearch('%zzzsearchsmoke%', 'zzzsearchsmoke', false, 30, 0, null)
  const withTag = await searchService.runUnionSearch('%zzzsearchsmoke%', 'zzzsearchsmoke', false, 30, 0, [999999999])
  const playlistsUnfiltered = unfiltered.filter((r: any) => r.model_type === 'Playlist' || r.model_type === 'Collection')
  const playlistsWithTag = withTag.filter((r: any) => r.model_type === 'Playlist' || r.model_type === 'Collection')
  assert.deepEqual(playlistsUnfiltered, playlistsWithTag)
})

test('findTrackIds with tagIds only returns tracks carrying one of those tags', async () => {
  const artist = await createArtist('search-track-tagids-artist')
  const album = await createAlbum('search-track-tagids-album', artist.id)
  const matching = await createTrack('search-track-tagids-matching-zzzunique', album.id, artist.id)
  const nonMatching = await createTrack('search-track-tagids-nonmatching-zzzunique', album.id, artist.id)
  const tag = await createTag('search-track-tagids-tag')
  await tagTrack(matching.id, tag.id)

  const ids = await searchService.findTrackIds('%zzzunique%', [tag.id])

  assert.ok(ids.includes(matching.id))
  assert.equal(ids.includes(nonMatching.id), false)
})

test('findTrackIds with an empty tagIds array returns nothing', async () => {
  const ids = await searchService.findTrackIds('%a%', [])
  assert.deepEqual(ids, [])
})

test('countRankedResults with tagIds excludes non-matching albums/artists from the count', async () => {
  // Uses its own substring (zzzcounttagids, not zzzunique) so this test's
  // count isn't polluted by the albums the runUnionSearch tests above create
  // in the same file run — cleanupFixtures only runs once, in `after`, so
  // earlier tests' rows are still present (and would ILIKE-match `%zzzunique%`)
  // while this test runs.
  const artist = await createArtist('search-count-tagids-artist')
  const matchingAlbum = await createAlbum('search-count-tagids-matching-zzzcounttagids', artist.id)
  const nonMatchingAlbum = await createAlbum('search-count-tagids-nonmatching-zzzcounttagids', artist.id)
  await createTrack('search-count-tagids-matching-track', matchingAlbum.id, artist.id)
  await createTrack('search-count-tagids-nonmatching-track', nonMatchingAlbum.id, artist.id)
  const tag = await createTag('search-count-tagids-tag')
  await tagAlbum(matchingAlbum.id, tag.id)

  const unfiltered = await searchService.countRankedResults('%zzzcounttagids%', 'zzzcounttagids', false, null)
  const filtered = await searchService.countRankedResults('%zzzcounttagids%', 'zzzcounttagids', false, [tag.id])

  assert.equal(unfiltered.Album, 2)
  assert.equal(filtered.Album, 1)
})

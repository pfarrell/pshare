// server/src/services/factoidService.test.ts
import { test, after, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import { db } from '../db/database.js'
import { createArtist, createAlbum, createTrack, cleanupFixtures } from '../test/fixtures.js'
import { claimEntity } from './factoidLedger.js'
import { insertFactoids } from './factoidStore.js'
import {
  buildArtistContext, buildAlbumContext, collectSearchHosts, existingTextsForRun,
} from './factoidService.js'

beforeEach(async () => { await cleanupFixtures() })
after(async () => { await cleanupFixtures(); await db.destroy() })

test('buildArtistContext includes the name and the stored wikipedia text', async () => {
  const artist = await createArtist('ctx-artist')
  await db.updateTable('artists').set({ wikipedia: 'A band from Kent.' }).where('id', '=', artist.id).execute()

  const ctx = await buildArtistContext(artist.id)
  assert.ok(ctx)
  assert.equal(ctx.kind, 'artist')
  assert.equal(ctx.name, artist.name)
  assert.match(ctx.prompt, /A band from Kent\./)
  assert.deepEqual(ctx.tracklist, [], 'an artist context carries no tracklist')
})

test('buildArtistContext returns null for a missing artist', async () => {
  assert.equal(await buildArtistContext(2_000_000_321), null)
})

test('buildAlbumContext includes the tracklist for track-scoped factoids', async () => {
  const artist = await createArtist('ctx-album-artist')
  const album = await createAlbum('ctx-album', artist.id)
  const trackA = await createTrack('ctx-track-a', album.id, artist.id)
  const trackB = await createTrack('ctx-track-b', album.id, artist.id)

  const ctx = await buildAlbumContext(album.id)
  assert.ok(ctx)
  assert.equal(ctx.kind, 'album')
  assert.deepEqual(
    ctx.tracklist.map((t) => t.id).sort(),
    [trackA.id, trackB.id].sort(),
  )
  assert.match(ctx.prompt, new RegExp(trackA.title))
})

test('buildAlbumContext survives an album whose artist row was deleted', async () => {
  // albums.artist_id has no FK, so this is a real state this DB permits.
  const artist = await createArtist('ctx-orphan-artist')
  const album = await createAlbum('ctx-orphan-album', artist.id)
  await db.deleteFrom('artists').where('id', '=', artist.id).execute()

  const ctx = await buildAlbumContext(album.id)
  assert.ok(ctx, 'an orphaned album must still build a context, not throw')
  assert.equal(ctx.kind, 'album')
  assert.ok(!ctx.prompt.includes('undefined'), 'no "undefined" may leak into the prompt')
})

test('buildAlbumContext returns null for a missing album', async () => {
  assert.equal(await buildAlbumContext(2_000_000_322), null)
})

test('collectSearchHosts gathers hosts from a web_search_tool_result block', () => {
  const hosts = new Set<string>()
  collectSearchHosts([
    { type: 'text', text: 'hello' },
    {
      type: 'web_search_tool_result',
      content: [
        { type: 'web_search_result', url: 'https://www.rollingstone.com/a' },
        { type: 'web_search_result', url: 'https://pitchfork.com/b' },
      ],
    },
  ], hosts)
  assert.deepEqual([...hosts].sort(), ['pitchfork.com', 'www.rollingstone.com'])
})

test('collectSearchHosts treats an error result as no hosts instead of throwing', () => {
  const hosts = new Set<string>()
  // Server tools return HTTP 200 with content as an ERROR OBJECT, not a list.
  collectSearchHosts([
    { type: 'web_search_tool_result', content: { type: 'web_search_tool_result_error', error_code: 'max_uses_exceeded' } },
  ], hosts)
  assert.equal(hosts.size, 0)
})

test('collectSearchHosts ignores malformed blocks and unparseable urls', () => {
  const hosts = new Set<string>()
  collectSearchHosts([
    null,
    { type: 'web_search_tool_result' },
    { type: 'web_search_tool_result', content: [{ type: 'web_search_result' }, { url: 'nonsense' }] },
  ] as unknown[], hosts)
  assert.equal(hosts.size, 0)
})

test('existingTextsForRun covers the album and every track on it', async () => {
  // Track-scoped factoids are keyed by TRACK id, so deduping an album run
  // against album texts alone would let "Research again" re-insert them.
  const artist = await createArtist('ex-artist')
  const album = await createAlbum('ex-album', artist.id)
  const track = await createTrack('ex-track', album.id, artist.id)
  const generationId = (await claimEntity('album', album.id))!
  const src = { sourceUrl: 'https://example.com/a', sourceTitle: null }
  await insertFactoids([
    { kind: 'album', targetId: album.id, text: 'Album text.', ...src },
    { kind: 'track', targetId: track.id, text: 'Track text.', ...src },
  ], 'm', generationId)

  const texts = await existingTextsForRun('album', album.id, [{ id: track.id, title: track.title }])
  assert.deepEqual([...texts].sort(), ['Album text.', 'Track text.'])
})

test('existingTextsForRun for an artist is just that artist\'s texts', async () => {
  const artist = await createArtist('ex-artist-only')
  const album = await createAlbum('ex-artist-album', artist.id)
  const generationId = (await claimEntity('artist', artist.id))!
  const src = { sourceUrl: 'https://example.com/a', sourceTitle: null }
  await insertFactoids([
    { kind: 'artist', targetId: artist.id, text: 'Artist text.', ...src },
    { kind: 'album', targetId: album.id, text: 'Unrelated album text.', ...src },
  ], 'm', generationId)

  assert.deepEqual(await existingTextsForRun('artist', artist.id, []), ['Artist text.'])
})

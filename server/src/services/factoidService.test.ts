// server/src/services/factoidService.test.ts
import { test, after, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import { db } from '../db/database.js'
import { createArtist, createAlbum, createTrack, cleanupFixtures } from '../test/fixtures.js'
import { claimEntity } from './factoidLedger.js'
import { insertFactoids } from './factoidStore.js'
import {
  buildArtistContext, buildAlbumContext, collectSearchHosts, existingTextsForRun, summarizeRun,
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

test('summarizeRun reports hosts, submitted, accepted, and discarded counts with reasons', () => {
  const line = summarizeRun({
    kind: 'album', targetId: 9, name: 'Aja', searchHosts: 3, submitted: 6, accepted: 4,
    rejected: ['duplicate text', 'length over 240'],
  })
  assert.match(line, /album 9 \(Aja\)/)
  assert.match(line, /search hosts=3/)
  assert.match(line, /submitted=6/)
  assert.match(line, /accepted=4/)
  assert.match(line, /discarded=2/)
  assert.match(line, /duplicate text; length over 240/)
})

test('summarizeRun flags the failure mode where the model submitted facts but no search results were seen', () => {
  // The live tool-runner loop is the one thing no local check exercises. If it
  // yields turns without the web_search_tool_result blocks, searchHosts stays
  // empty and EVERY citation is discarded: the run records "empty" and the worker
  // keeps spending. That has to be diagnosable from the log line alone.
  const line = summarizeRun({
    kind: 'artist', targetId: 2, name: 'Steely Dan', searchHosts: 0, submitted: 5, accepted: 0,
    rejected: Array(5).fill('source_url host was never returned by web search'),
  })
  assert.match(line, /WARNING/)
  assert.match(line, /no web search results were seen/)
})

test('summarizeRun does not warn when nothing was submitted or hosts were seen', () => {
  assert.doesNotMatch(
    summarizeRun({ kind: 'album', targetId: 1, name: 'X', searchHosts: 0, submitted: 0, accepted: 0, rejected: [] }),
    /WARNING/,
  )
  assert.doesNotMatch(
    summarizeRun({ kind: 'album', targetId: 1, name: 'X', searchHosts: 2, submitted: 3, accepted: 3, rejected: [] }),
    /WARNING/,
  )
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

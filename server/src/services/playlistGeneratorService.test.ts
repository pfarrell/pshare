// server/src/services/playlistGeneratorService.test.ts
import 'dotenv/config'
import { test } from 'node:test'
import assert from 'node:assert/strict'
import type { Context } from 'hono'
import Anthropic from '@anthropic-ai/sdk'
import { db } from '../db/database.js'
import { generatePlaylist } from './playlistGeneratorService.js'

async function makeFixtureTrack(names?: { artistName: string; albumTitle: string; trackTitle: string }) {
  const { artistName, albumTitle, trackTitle } = names ?? {
    artistName: 'AI Mix Fixture Artist', albumTitle: 'AI Mix Fixture Album', trackTitle: 'AI Mix Fixture Track',
  }
  const artist = await db
    .insertInto('artists')
    .values({ name: artistName, image_path: null, wikipedia: null, musicbrainz_id: null, mbid_confidence: null, mbid_status: null })
    .returning('id')
    .executeTakeFirstOrThrow()
  const album = await db
    .insertInto('albums')
    .values({
      title: albumTitle, artist_id: artist.id, release_year: null, disc_number: null,
      genre_id: null, image_path: null, wikipedia: null, musicbrainz_id: null,
      release_group_musicbrainz_id: null, mbid_confidence: null, mbid_status: null, is_compilation: false,
    })
    .returning('id')
    .executeTakeFirstOrThrow()
  const track = await db
    .insertInto('tracks')
    .values({
      title: trackTitle, track_number: null, release_year: null, album_id: album.id,
      artist_id: artist.id, media_file_id: null, wikipedia: null, duration_sec: null, approved: true,
    })
    .returning('id')
    .executeTakeFirstOrThrow()
  return { artistId: artist.id, albumId: album.id, trackId: track.id }
}

async function cleanupFixtureTrack(ids: { artistId: number; albumId: number; trackId: number }) {
  await db.deleteFrom('tracks').where('id', '=', ids.trackId).execute()
  await db.deleteFrom('albums').where('id', '=', ids.albumId).execute()
  await db.deleteFrom('artists').where('id', '=', ids.artistId).execute()
}

function anthropicMessage(content: unknown[], stopReason: string) {
  return new Response(
    JSON.stringify({
      id: 'msg_test', type: 'message', role: 'assistant', model: 'claude-sonnet-5',
      content, stop_reason: stopReason, stop_sequence: null,
      usage: { input_tokens: 10, output_tokens: 10 },
    }),
    { status: 200, headers: { 'content-type': 'application/json' } },
  )
}

const fakeContext = {} as Context // fetchTracksByIds only uses it for streamBase(c); not exercised by track-existence assertions below

test('finalize_playlist track ids confirmed via search_library are returned', async (t) => {
  const fixture = await makeFixtureTrack()
  try {
    let call = 0
    t.mock.method(globalThis, 'fetch', async () => {
      call += 1
      if (call === 1) {
        return anthropicMessage(
          [{ type: 'tool_use', id: 'toolu_1', name: 'search_library', input: { title: 'AI Mix Fixture', artist: 'AI Mix Fixture Artist' } }],
          'tool_use',
        )
      }
      if (call === 2) {
        return anthropicMessage(
          [{ type: 'tool_use', id: 'toolu_2', name: 'finalize_playlist', input: { track_ids: [fixture.trackId] } }],
          'tool_use',
        )
      }
      return anthropicMessage([{ type: 'text', text: 'Done.' }], 'end_turn')
    })

    const result = await generatePlaylist('AI Mix Fixture', 1, fakeContext)
    assert.deepEqual(result.trackIds, [fixture.trackId])
  } finally {
    await cleanupFixtureTrack(fixture)
  }
})

test('a track id in finalize_playlist never returned by search_library is dropped', async (t) => {
  // Two real, DB-backed tracks: one gets confirmed via a mocked
  // search_library call, the other is real but never searched for in this
  // run (and, deliberately, named so it wouldn't even match the query the
  // model uses below — otherwise the live search_library DB query would
  // confirm it too, defeating the point). Plus a third, outright
  // nonexistent id. This distinguishes the guard's real property — "was
  // this id returned by search_library during THIS run" — from a weaker,
  // insufficient check like "does this id exist in the DB at all," which
  // the never-searched real fixture would incorrectly pass.
  const confirmed = await makeFixtureTrack()
  const neverSearched = await makeFixtureTrack({
    artistName: 'Guard Test Untouched Artist', albumTitle: 'Guard Test Untouched Album', trackTitle: 'Guard Test Untouched Track',
  })
  try {
    let call = 0
    t.mock.method(globalThis, 'fetch', async () => {
      call += 1
      if (call === 1) {
        return anthropicMessage(
          [{ type: 'tool_use', id: 'toolu_1', name: 'search_library', input: { title: 'AI Mix Fixture', artist: 'AI Mix Fixture Artist' } }],
          'tool_use',
        )
      }
      if (call === 2) {
        return anthropicMessage(
          [{
            type: 'tool_use', id: 'toolu_2', name: 'finalize_playlist',
            input: { track_ids: [confirmed.trackId, neverSearched.trackId, 999999999] },
          }],
          'tool_use',
        )
      }
      return anthropicMessage([{ type: 'text', text: 'Done.' }], 'end_turn')
    })

    const result = await generatePlaylist('AI Mix Fixture', 1, fakeContext)
    assert.deepEqual(result.trackIds, [confirmed.trackId])
  } finally {
    await cleanupFixtureTrack(confirmed)
    await cleanupFixtureTrack(neverSearched)
  }
})

test('an Anthropic API failure rejects rather than resolving with a fake result', async (t) => {
  t.mock.method(globalThis, 'fetch', async () =>
    new Response(
      JSON.stringify({ type: 'error', error: { type: 'rate_limit_error', message: 'rate limited' } }),
      { status: 429, headers: { 'content-type': 'application/json' } },
    ),
  )

  await assert.rejects(() => generatePlaylist('anything', 1, fakeContext), Anthropic.APIError)
})

test('search_library narrows by artist when both title and artist are given', async (t) => {
  // Same title, two different artists: a { title, artist } search must
  // confirm only the matching artist's track, so finalize_playlist (which
  // offers both ids) keeps only that one.
  const wanted = await makeFixtureTrack({
    artistName: 'Narrow Test Wanted Artist', albumTitle: 'Narrow Test Album A', trackTitle: 'Narrow Test Shared Title',
  })
  const other = await makeFixtureTrack({
    artistName: 'Narrow Test Other Artist', albumTitle: 'Narrow Test Album B', trackTitle: 'Narrow Test Shared Title',
  })
  try {
    let call = 0
    t.mock.method(globalThis, 'fetch', async () => {
      call += 1
      if (call === 1) {
        return anthropicMessage(
          [{
            type: 'tool_use', id: 'toolu_1', name: 'search_library',
            input: { title: 'Narrow Test Shared Title', artist: 'Narrow Test Wanted Artist' },
          }],
          'tool_use',
        )
      }
      if (call === 2) {
        return anthropicMessage(
          [{ type: 'tool_use', id: 'toolu_2', name: 'finalize_playlist', input: { track_ids: [wanted.trackId, other.trackId] } }],
          'tool_use',
        )
      }
      return anthropicMessage([{ type: 'text', text: 'Done.' }], 'end_turn')
    })

    const result = await generatePlaylist('Narrow Test', 2, fakeContext)
    assert.deepEqual(result.trackIds, [wanted.trackId])
  } finally {
    await cleanupFixtureTrack(wanted)
    await cleanupFixtureTrack(other)
  }
})

test('hitting the overall timeout resolves with the already-finalized tracks instead of rejecting', async (t) => {
  const fixture = await makeFixtureTrack()
  try {
    let call = 0
    let abortedFetch = false
    t.mock.method(globalThis, 'fetch', async (_url: unknown, init?: RequestInit) => {
      call += 1
      if (call === 1) {
        return anthropicMessage(
          [{ type: 'tool_use', id: 'toolu_1', name: 'search_library', input: { title: 'AI Mix Fixture', artist: 'AI Mix Fixture Artist' } }],
          'tool_use',
        )
      }
      if (call === 2) {
        return anthropicMessage(
          [{ type: 'tool_use', id: 'toolu_2', name: 'finalize_playlist', input: { track_ids: [fixture.trackId] } }],
          'tool_use',
        )
      }
      // Third turn hangs until the abort signal fires — simulating a slow
      // Anthropic response arriving after finalize_playlist already ran.
      return new Promise<Response>((_, reject) => {
        init?.signal?.addEventListener('abort', () => {
          abortedFetch = true
          reject(new DOMException('aborted', 'AbortError'))
        })
      })
    })

    const result = await generatePlaylist('AI Mix Fixture', 1, fakeContext, 50)
    assert.deepEqual(result.trackIds, [fixture.trackId])
    assert.equal(abortedFetch, true, 'the in-flight request should be cancelled, not left running')
  } finally {
    await cleanupFixtureTrack(fixture)
  }
})

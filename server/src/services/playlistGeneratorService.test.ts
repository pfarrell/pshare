// server/src/services/playlistGeneratorService.test.ts
import 'dotenv/config'
import { test } from 'node:test'
import assert from 'node:assert/strict'
import type { Context } from 'hono'
import Anthropic from '@anthropic-ai/sdk'
import { db } from '../db/database.js'
import { generatePlaylist } from './playlistGeneratorService.js'

async function makeFixtureTrack() {
  const artist = await db
    .insertInto('artists')
    .values({ name: 'AI Mix Fixture Artist', image_path: null, wikipedia: null, musicbrainz_id: null, mbid_confidence: null, mbid_status: null })
    .returning('id')
    .executeTakeFirstOrThrow()
  const album = await db
    .insertInto('albums')
    .values({
      title: 'AI Mix Fixture Album', artist_id: artist.id, release_year: null, disc_number: null,
      genre_id: null, image_path: null, wikipedia: null, musicbrainz_id: null,
      release_group_musicbrainz_id: null, mbid_confidence: null, mbid_status: null, is_compilation: false,
    })
    .returning('id')
    .executeTakeFirstOrThrow()
  const track = await db
    .insertInto('tracks')
    .values({
      title: 'AI Mix Fixture Track', track_number: null, release_year: null, album_id: album.id,
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
          [{ type: 'tool_use', id: 'toolu_1', name: 'search_library', input: { query: 'AI Mix Fixture' } }],
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
  let call = 0
  t.mock.method(globalThis, 'fetch', async () => {
    call += 1
    if (call === 1) {
      // Model never calls search_library at all, jumps straight to finalize
      // with a made-up id.
      return anthropicMessage(
        [{ type: 'tool_use', id: 'toolu_1', name: 'finalize_playlist', input: { track_ids: [999999999] } }],
        'tool_use',
      )
    }
    return anthropicMessage([{ type: 'text', text: 'Done.' }], 'end_turn')
  })

  const result = await generatePlaylist('anything', 1, fakeContext)
  assert.deepEqual(result.trackIds, [])
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

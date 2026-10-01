// server/src/services/playlistNameSuggesterService.test.ts
import 'dotenv/config'
import { test } from 'node:test'
import assert from 'node:assert/strict'
import Anthropic from '@anthropic-ai/sdk'
import { suggestPlaylistName, MAX_SUGGESTED_NAME_LENGTH } from './playlistNameSuggesterService.js'

function anthropicMessage(content: unknown[], stopReason: string) {
  return new Response(
    JSON.stringify({
      id: 'msg_test', type: 'message', role: 'assistant', model: 'claude-sonnet-5-5',
      content, stop_reason: stopReason, stop_sequence: null,
      usage: { input_tokens: 10, output_tokens: 10 },
    }),
    { status: 200, headers: { 'content-type': 'application/json' } },
  )
}

test('returns the model\'s suggested name, trimmed', async (t) => {
  t.mock.method(globalThis, 'fetch', async () =>
    anthropicMessage([{ type: 'text', text: '  Sunset Drive  ' }], 'end_turn'),
  )

  const result = await suggestPlaylistName(['Some Artist - Some Track'])
  assert.equal(result, 'Sunset Drive')
})

test('strips em dashes from the suggested name (house style bans them app-wide)', async (t) => {
  t.mock.method(globalThis, 'fetch', async () =>
    anthropicMessage([{ type: 'text', text: 'Chill — Vibes' }], 'end_turn'),
  )

  const result = await suggestPlaylistName(['Some Artist - Some Track'])
  assert.equal(result, 'Chill - Vibes')
})

test('truncates a name over the max length', async (t) => {
  const tooLong = 'a'.repeat(MAX_SUGGESTED_NAME_LENGTH + 20)
  t.mock.method(globalThis, 'fetch', async () =>
    anthropicMessage([{ type: 'text', text: tooLong }], 'end_turn'),
  )

  const result = await suggestPlaylistName(['Some Artist - Some Track'])
  assert.equal(result.length, MAX_SUGGESTED_NAME_LENGTH)
})

test('rejects rather than resolving with an empty name when the model returns nothing usable', async (t) => {
  t.mock.method(globalThis, 'fetch', async () => anthropicMessage([{ type: 'text', text: '   ' }], 'end_turn'))

  await assert.rejects(() => suggestPlaylistName(['Some Artist - Some Track']))
})

test('an Anthropic API failure rejects rather than resolving with a fake result', async (t) => {
  t.mock.method(globalThis, 'fetch', async () =>
    new Response(
      JSON.stringify({ type: 'error', error: { type: 'rate_limit_error', message: 'rate limited' } }),
      { status: 429, headers: { 'content-type': 'application/json' } },
    ),
  )

  await assert.rejects(() => suggestPlaylistName(['Some Artist - Some Track']), Anthropic.APIError)
})

test('an unresponsive call is aborted at the timeout instead of hanging', async (t) => {
  let abortedFetch = false
  t.mock.method(globalThis, 'fetch', async (_url: unknown, init?: RequestInit) =>
    new Promise<Response>((_, reject) => {
      init?.signal?.addEventListener('abort', () => {
        abortedFetch = true
        reject(new DOMException('aborted', 'AbortError'))
      })
    }),
  )

  await assert.rejects(() => suggestPlaylistName(['Some Artist - Some Track'], 50))
  assert.equal(abortedFetch, true, 'the in-flight request should be cancelled, not left running')
})

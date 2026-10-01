// server/src/services/factoidService.fakeApi.test.ts
// Runs the REAL generateFactoidsFor (real SDK tool runner, real validation, real
// DB) against a LOCAL FAKE of the Anthropic Messages API: no key, no network, no
// spend. It cannot say how the real model behaves, but it pins what this code does
// with documented response shapes and exactly what it sends back, which is the
// part nothing else exercises (the model loop is otherwise only type-checked).
import { test, before, after, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import http from 'node:http'
import type { AddressInfo } from 'node:net'
import { db } from '../db/database.js'
import { createArtist, createAlbum, createTrack, cleanupFixtures } from '../test/fixtures.js'
import { claimEntity } from './factoidLedger.js'
import { generateFactoidsFor } from './factoidService.js'

type Json = Record<string, any>

let server: http.Server
let scripted: { status: number, body: Json }[] = []
let requests: Json[] = []
let counter = 0
const saved = { base: process.env.ANTHROPIC_BASE_URL, key: process.env.ANTHROPIC_API_KEY }

before(async () => {
  server = http.createServer((req, res) => {
    let raw = ''
    req.on('data', (c) => { raw += c })
    req.on('end', () => {
      requests.push(raw ? JSON.parse(raw) : {})
      const next = scripted[requests.length - 1]
      // An unscripted request is a bug in the test or the code under test: fail loudly.
      const { status, body } = next ?? { status: 500, body: { type: 'error', error: { type: 'api_error', message: `no scripted response for request #${requests.length}` } } }
      res.writeHead(status, { 'content-type': 'application/json' })
      res.end(JSON.stringify(body))
    })
  })
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', () => r()))
  process.env.ANTHROPIC_BASE_URL = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
  process.env.ANTHROPIC_API_KEY = 'sk-ant-fake-local-only'
})

beforeEach(async () => {
  await cleanupFixtures()
  requests = []
  scripted = []
})

after(async () => {
  await cleanupFixtures()
  server.close()
  if (saved.base === undefined) delete process.env.ANTHROPIC_BASE_URL; else process.env.ANTHROPIC_BASE_URL = saved.base
  if (saved.key === undefined) delete process.env.ANTHROPIC_API_KEY; else process.env.ANTHROPIC_API_KEY = saved.key
  await db.destroy()
})

const message = (content: Json[], stop_reason: string) => ({
  status: 200,
  body: {
    id: `msg_fake_${++counter}`, type: 'message', role: 'assistant', model: 'claude-opus-5-5',
    content, stop_reason, stop_sequence: null, usage: { input_tokens: 10, output_tokens: 10 },
  },
})
const serverToolUse = { type: 'server_tool_use', id: 'srvtoolu_1', name: 'web_search', input: { query: 'aja recording' } }
const searchOk = {
  type: 'web_search_tool_result', tool_use_id: 'srvtoolu_1',
  content: [{ type: 'web_search_result', url: 'https://www.rollingstone.com/story', title: 'Rolling Stone', encrypted_content: 'abc', page_age: '2 days ago' }],
}
// On a search error the API returns HTTP 200 with `content` as an error OBJECT.
const searchError = {
  type: 'web_search_tool_result', tool_use_id: 'srvtoolu_1',
  content: { type: 'web_search_tool_result_error', error_code: 'max_uses_exceeded' },
}
const submit = (facts: Json[]) => ({ type: 'tool_use', id: 'toolu_1', name: 'submit_factoids', input: { factoids: facts } })
const done = { type: 'text', text: 'Done.' }

const facts = (trackTitle: string) => [
  { text: 'An album fact with a real source.', source_url: 'https://www.rollingstone.com/story', source_title: 'Rolling Stone', scope: 'album' },
  { text: 'A track fact with a real source.', source_url: 'https://www.rollingstone.com/story', source_title: 'Rolling Stone', scope: 'track', track_title: trackTitle },
  { text: 'A fact citing a source the search never returned.', source_url: 'https://made-up-site.test/page', source_title: 'Invented', scope: 'album' },
]

const scaffold = async (label: string) => {
  const artist = await createArtist(`${label}-artist`)
  const album = await createAlbum(`${label}-album`, artist.id)
  const track = await createTrack(`${label}-track`, album.id, artist.id)
  const generationId = (await claimEntity('album', album.id))!
  return { album, track, generationId }
}

const storedTexts = async (generationId: number) =>
  (await db.selectFrom('factoids').select(['kind', 'text']).where('generation_id', '=', generationId).execute())
    .map((r) => `${r.kind}: ${r.text}`).sort()

test('a normal run stores cited facts, discards the invented citation, and sends a documented request shape', async () => {
  const { album, track, generationId } = await scaffold('fake-normal')
  scripted = [
    message([serverToolUse, searchOk, submit(facts(track.title))], 'tool_use'),
    message([done], 'end_turn'),
  ]

  const result = await generateFactoidsFor('album', album.id, generationId)

  assert.deepEqual(result, { status: 'ok', count: 2 })
  assert.deepEqual(await storedTexts(generationId), ['album: An album fact with a real source.', 'track: A track fact with a real source.'])

  const first = requests[0]
  assert.equal(first.model, 'claude-opus-5-5')
  assert.equal(first.output_config?.effort, 'low', 'effort is set explicitly: this model defaults to medium')
  assert.equal(first.tool_choice, undefined, 'forced tool_choice returns HTTP 400 on claude-opus-5-5')
  const toolTypes = first.tools.map((t: Json) => t.type)
  assert.ok(toolTypes.includes('web_search_20260209'), 'uses the current web search tool')
  assert.ok(!toolTypes.some((t: string) => String(t).startsWith('code_execution')), 'no separate code_execution next to dynamic-filtering web search')
  assert.equal(first.tools.find((t: Json) => t.type === 'web_search_20260209').max_uses, 5)
  assert.ok(!('max_iterations' in first), 'max_iterations is a client-side runner option and must not leak into the request body')
})

test('a paused turn is resumed exactly once and the run still finishes', async () => {
  // pause_turn is what server tools like web_search return on long turns. The SDK
  // runner is expected to send the paused turn back unchanged; if a future SDK stops
  // doing that, the run would silently truncate (one request, nothing stored).
  const { album, track, generationId } = await scaffold('fake-pause')
  scripted = [
    message([serverToolUse, searchOk], 'pause_turn'),
    message([submit(facts(track.title))], 'tool_use'),
    message([done], 'end_turn'),
  ]

  const result = await generateFactoidsFor('album', album.id, generationId)

  assert.deepEqual(result, { status: 'ok', count: 2 })
  assert.equal(requests.length, 3, 'paused turn resumed, then tool result sent back')
  const lastMessages = requests[2].messages as Json[]
  const pausedCopies = lastMessages.filter((m) =>
    m.role === 'assistant' && Array.isArray(m.content) && m.content.some((b: Json) => b.type === 'web_search_tool_result'))
  assert.equal(pausedCopies.length, 1, 'the paused assistant turn must be sent back once, not duplicated')
})

test('a web search error result discards every citation and records empty without throwing', async () => {
  const { album, track, generationId } = await scaffold('fake-searcherr')
  scripted = [
    message([serverToolUse, searchError, submit(facts(track.title))], 'tool_use'),
    message([done], 'end_turn'),
  ]

  const result = await generateFactoidsFor('album', album.id, generationId)

  assert.deepEqual(result, { status: 'empty', count: 0 })
  assert.deepEqual(await storedTexts(generationId), [])
})

test('an API error propagates so the poller records the entity as failed and can retry it', async () => {
  // 400 is not retried by the SDK, so this stays fast. A swallowed error here would
  // record "empty", which is never retried.
  const { album, generationId } = await scaffold('fake-apierr')
  scripted = [{ status: 400, body: { type: 'error', error: { type: 'invalid_request_error', message: 'bad request' } } }]

  await assert.rejects(generateFactoidsFor('album', album.id, generationId), /bad request|400/)
  assert.deepEqual(await storedTexts(generationId), [])
})

test('an entity that no longer exists returns empty without calling the API', async () => {
  const result = await generateFactoidsFor('album', 2_000_000_999, 1)

  assert.deepEqual(result, { status: 'empty', count: 0 })
  assert.equal(requests.length, 0, 'a deleted entity must never cost an API call')
})

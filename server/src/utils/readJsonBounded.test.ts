import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readJsonBounded } from './readJsonBounded.js'

const req = (body: string | null, headers: Record<string, string> = {}) =>
  new Request('http://x/y', { method: 'POST', headers, ...(body === null ? {} : { body }) })

test('parses a small JSON body', async () => {
  assert.deepEqual(await readJsonBounded(req('{"a":1}'), 100), { ok: true, value: { a: 1 } })
})

test('a body exactly at the limit is accepted', async () => {
  const body = JSON.stringify({ pad: 'x'.repeat(50) })
  assert.equal((await readJsonBounded(req(body), Buffer.byteLength(body))).ok, true)
})

test('a body over the limit is rejected as too-large without being parsed', async () => {
  const result = await readJsonBounded(req('{"pad":"' + 'x'.repeat(500) + '"}'), 100)
  assert.deepEqual(result, { ok: false, reason: 'too-large' })
})

test('an over-limit Content-Length is rejected up front, even if the body is small', async () => {
  const result = await readJsonBounded(req('{}', { 'content-length': '999999' }), 100)
  assert.deepEqual(result, { ok: false, reason: 'too-large' })
})

test('stops reading once the limit is exceeded instead of buffering the whole body', async () => {
  let pulled = 0
  const chunk = new TextEncoder().encode('x'.repeat(64))
  const stream = new ReadableStream({
    pull(controller) {
      pulled += 1
      if (pulled > 1000) { controller.close(); return }
      controller.enqueue(chunk)
    },
  })
  const request = new Request('http://x/y', { method: 'POST', body: stream, duplex: 'half' } as any)

  const result = await readJsonBounded(request, 256)

  assert.deepEqual(result, { ok: false, reason: 'too-large' })
  assert.ok(pulled < 20, `pulled ${pulled} chunks, expected it to stop early`)
})

test('invalid JSON and empty bodies are invalid, not too-large', async () => {
  assert.deepEqual(await readJsonBounded(req('not json {'), 100), { ok: false, reason: 'invalid' })
  assert.deepEqual(await readJsonBounded(req(''), 100), { ok: false, reason: 'invalid' })
  assert.deepEqual(await readJsonBounded(req(null), 100), { ok: false, reason: 'invalid' })
})

test('multi-byte characters are counted in bytes, not characters', async () => {
  const body = JSON.stringify({ s: 'é'.repeat(60) }) // 60 chars, 120 bytes in the string
  const bytes = Buffer.byteLength(body)
  assert.equal((await readJsonBounded(req(body), bytes)).ok, true)
  assert.equal((await readJsonBounded(req(body), bytes - 1)).ok, false)
})

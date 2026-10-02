import { test, afterEach } from 'node:test'
import assert from 'node:assert/strict'
import { getAlbumSummary, getArtistSummary, withDeadline } from './wikipedia.js'

const realFetch = globalThis.fetch
afterEach(() => { globalThis.fetch = realFetch })

const pageResponse = (title: string) =>
  new Response(JSON.stringify({ extract: `About ${title}.`, content_urls: { desktop: { page: `https://en.wikipedia.org/wiki/${title}` } } }), { status: 200 })

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

test('withDeadline returns the lookup result when it beats the deadline', async () => {
  assert.equal(await withDeadline(Promise.resolve('hit'), 200), 'hit')
})

test('withDeadline returns null at the deadline but lets the lookup finish', async () => {
  let finished = false
  const slow = sleep(80).then(() => { finished = true; return 'late' })
  const started = Date.now()
  assert.equal(await withDeadline(slow, 20), null)
  assert.ok(Date.now() - started < 70, 'must not wait for the slow lookup')
  assert.equal(await slow, 'late')
  assert.equal(finished, true)
})

test('withDeadline turns a rejected lookup into null', async () => {
  assert.equal(await withDeadline(Promise.reject(new Error('boom')), 200), null)
})

test('candidate titles are fetched concurrently, not one after another', async () => {
  let inFlight = 0
  let maxInFlight = 0
  globalThis.fetch = (async () => {
    inFlight++
    maxInFlight = Math.max(maxInFlight, inFlight)
    await sleep(15)
    inFlight--
    return new Response('', { status: 404 })
  }) as typeof fetch

  assert.equal(await getArtistSummary('Concurrency Test Artist One'), null)
  assert.equal(maxInFlight, 4, 'all four artist candidates should be in flight together')
})

test('the highest-priority candidate wins even when a lower one answers first', async () => {
  globalThis.fetch = (async (input: RequestInfo | URL) => {
    const url = String(input)
    if (url.includes('%28album%29')) return pageResponse('plain-album-candidate') // fast, lower priority
    await sleep(30)
    return pageResponse('artist-album-candidate') // slow, highest priority
  }) as typeof fetch

  const summary = await getAlbumSummary('Priority Artist', 'Priority Album')
  assert.match(summary!.summary, /artist-album-candidate/)
})

test('a fetch is given an abort signal so a hung Wikipedia cannot hang the lookup', async () => {
  const signals: (AbortSignal | undefined)[] = []
  globalThis.fetch = (async (_input: RequestInfo | URL, init?: RequestInit) => {
    signals.push(init?.signal ?? undefined)
    return new Response('', { status: 404 })
  }) as typeof fetch

  await getArtistSummary('Signal Test Artist')
  assert.ok(signals.length > 0 && signals.every((s) => s instanceof AbortSignal))
})

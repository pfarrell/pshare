// server/src/workers/factoidPoller.test.ts
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { factoidTick, factoidPollerEnabled, type FactoidTickDeps } from './factoidPoller.js'

const deps = (over: Partial<FactoidTickDeps> = {}): FactoidTickDeps => ({
  reapStalePending: async () => 0,
  generationsInLastDay: async () => 0,
  nextCandidate: async () => ({ kind: 'album', targetId: 5 }),
  claimEntity: async () => 99,
  recordResult: async () => {},
  generate: async () => ({ status: 'ok', count: 3 }),
  ...over,
})

test('a normal tick reaps, claims, generates, and records the result', async () => {
  const calls: string[] = []
  const result = await factoidTick(deps({
    reapStalePending: async () => { calls.push('reap'); return 0 },
    claimEntity: async () => { calls.push('claim'); return 99 },
    generate: async () => { calls.push('generate'); return { status: 'ok', count: 3 } },
    recordResult: async (id, status, count) => { calls.push(`record:${id}:${status}:${count}`) },
  }))
  assert.equal(result, 'generated')
  assert.deepEqual(calls, ['reap', 'claim', 'generate', 'record:99:ok:3'])
})

test('the tick does nothing billable once the daily cap is reached', async () => {
  let generated = false
  const result = await factoidTick(deps({
    generationsInLastDay: async () => 50,
    generate: async () => { generated = true; return { status: 'ok', count: 1 } },
  }))
  assert.equal(result, 'capped')
  assert.equal(generated, false, 'the cap must prevent any billed call')
})

test('the reaper still runs when the cap is reached', async () => {
  let reaped = false
  await factoidTick(deps({
    generationsInLastDay: async () => 50,
    reapStalePending: async () => { reaped = true; return 1 },
  }))
  assert.equal(reaped, true)
})

test('no candidate means no claim and no generation', async () => {
  let claimed = false
  const result = await factoidTick(deps({
    nextCandidate: async () => null,
    claimEntity: async () => { claimed = true; return 1 },
  }))
  assert.equal(result, 'no-candidate')
  assert.equal(claimed, false)
})

test('losing the claim race skips generation entirely', async () => {
  let generated = false
  const result = await factoidTick(deps({
    claimEntity: async () => null,
    generate: async () => { generated = true; return { status: 'ok', count: 1 } },
  }))
  assert.equal(result, 'claim-lost')
  assert.equal(generated, false)
})

test('an empty generation is recorded as empty, not failed', async () => {
  let recorded = ''
  const result = await factoidTick(deps({
    generate: async () => ({ status: 'empty', count: 0 }),
    recordResult: async (_id, status) => { recorded = status },
  }))
  assert.equal(result, 'generated')
  assert.equal(recorded, 'empty')
})

test('a thrown generation error is recorded as failed and does not escape the tick', async () => {
  let recorded: [string, number, string | null] | null = null
  const result = await factoidTick(deps({
    generate: async () => { throw new Error('upstream exploded') },
    recordResult: async (_id, status, count, error) => { recorded = [status, count, error ?? null] },
  }))
  assert.equal(result, 'errored', 'the poll loop must survive a bad generation')
  assert.ok(recorded)
  assert.equal(recorded[0], 'failed')
  assert.equal(recorded[1], 0)
  assert.match(String(recorded[2]), /upstream exploded/)
})

test('one tick generates at most once', async () => {
  let generations = 0
  await factoidTick(deps({ generate: async () => { generations += 1; return { status: 'ok', count: 1 } } }))
  assert.equal(generations, 1)
})

test('the poller is on by default and has an explicit kill switch', () => {
  // `npm run worker` is also what runs locally for upload testing: with a real
  // API key in the environment, an unguarded poller would start spending money
  // from the dev logs. FACTOIDS_DISABLED is the off switch.
  assert.equal(factoidPollerEnabled({}), true)
  assert.equal(factoidPollerEnabled({ FACTOIDS_DISABLED: '0' }), true)
  assert.equal(factoidPollerEnabled({ FACTOIDS_DISABLED: '1' }), false)
  assert.equal(factoidPollerEnabled({ FACTOIDS_DISABLED: 'true' }), false)
})

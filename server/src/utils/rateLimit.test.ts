import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createFixedWindowLimiter } from './rateLimit.js'

test('allows calls up to the limit within the window', () => {
  const allowed = createFixedWindowLimiter(3, 60_000)
  assert.equal(allowed('key-a'), true)
  assert.equal(allowed('key-a'), true)
  assert.equal(allowed('key-a'), true)
})

test('rejects calls beyond the limit within the window', () => {
  const allowed = createFixedWindowLimiter(2, 60_000)
  assert.equal(allowed('key-b'), true)
  assert.equal(allowed('key-b'), true)
  assert.equal(allowed('key-b'), false)
})

test('tracks each key independently', () => {
  const allowed = createFixedWindowLimiter(1, 60_000)
  assert.equal(allowed('key-c'), true)
  assert.equal(allowed('key-d'), true)
  assert.equal(allowed('key-c'), false)
})

test('resets after the window elapses', () => {
  const allowed = createFixedWindowLimiter(1, 10)
  assert.equal(allowed('key-e'), true)
  assert.equal(allowed('key-e'), false)
  return new Promise((resolve) => {
    setTimeout(() => {
      assert.equal(allowed('key-e'), true)
      resolve(undefined)
    }, 20)
  })
})

test('a cost greater than 1 consumes that much of the window', () => {
  const allowed = createFixedWindowLimiter(10, 60_000)
  assert.equal(allowed('key-f', 6), true)
  assert.equal(allowed('key-f', 4), true)
  assert.equal(allowed('key-f', 1), false)
})

test('rejects a single call whose cost exceeds the whole limit', () => {
  const allowed = createFixedWindowLimiter(5, 60_000)
  assert.equal(allowed('key-g', 6), false)
  assert.equal(allowed('key-g', 5), true)
})

test('a rejected call does not consume any of the window', () => {
  const allowed = createFixedWindowLimiter(5, 60_000)
  assert.equal(allowed('key-h', 4), true)
  assert.equal(allowed('key-h', 3), false)
  assert.equal(allowed('key-h', 1), true)
})

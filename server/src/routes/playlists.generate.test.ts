import { test } from 'node:test'
import assert from 'node:assert/strict'
import { resolvePrompt, resolveGenerateSize, MAX_GENERATE_SIZE, DEFAULT_GENERATE_SIZE } from './playlists.js'

test('resolvePrompt trims and accepts a real prompt', () => {
  assert.equal(resolvePrompt('  upbeat cleaning music  '), 'upbeat cleaning music')
})

test('resolvePrompt rejects empty/whitespace-only input', () => {
  assert.equal(resolvePrompt(''), null)
  assert.equal(resolvePrompt('   '), null)
  assert.equal(resolvePrompt(undefined), null)
  assert.equal(resolvePrompt(42), null)
})

test('resolveGenerateSize defaults when missing/invalid', () => {
  assert.equal(resolveGenerateSize(undefined), DEFAULT_GENERATE_SIZE)
  assert.equal(resolveGenerateSize('not a number'), DEFAULT_GENERATE_SIZE)
  assert.equal(resolveGenerateSize(0), DEFAULT_GENERATE_SIZE)
  assert.equal(resolveGenerateSize(-5), DEFAULT_GENERATE_SIZE)
})

test('resolveGenerateSize clamps to the hard cap', () => {
  assert.equal(resolveGenerateSize(100000), MAX_GENERATE_SIZE)
  assert.equal(resolveGenerateSize(30), MAX_GENERATE_SIZE)
})

test('resolveGenerateSize floors fractional sizes within range', () => {
  assert.equal(resolveGenerateSize(12.9), 12)
})

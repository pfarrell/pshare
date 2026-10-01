// server/src/services/factoidValidation.test.ts
import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  validateFactoids, sanitizeText, normalizeForDedupe, hostOf,
  MAX_FACTOID_LENGTH, type ValidationContext,
} from './factoidValidation.js'

const ctx = (overrides: Partial<ValidationContext> = {}): ValidationContext => ({
  kind: 'album',
  targetId: 10,
  searchHosts: new Set(['example.com', 'rollingstone.com']),
  tracklist: [{ id: 101, title: 'Deacon Blues' }, { id: 102, title: 'Josie' }],
  existingTexts: [],
  ...overrides,
})

const good = (overrides = {}) => ({
  text: 'The horn solo was cut in a single take.',
  source_url: 'https://example.com/story',
  source_title: 'A Story',
  scope: 'album',
  ...overrides,
})

test('a well-formed, cited album factoid is accepted', () => {
  const { accepted, rejected } = validateFactoids([good()], ctx())
  assert.equal(rejected.length, 0)
  assert.equal(accepted.length, 1)
  assert.deepEqual(accepted[0], {
    kind: 'album', targetId: 10,
    text: 'The horn solo was cut in a single take.',
    sourceUrl: 'https://example.com/story', sourceTitle: 'A Story',
  })
})

test('a factoid with no source_url is discarded', () => {
  const { accepted, rejected } = validateFactoids([good({ source_url: undefined })], ctx())
  assert.equal(accepted.length, 0)
  assert.match(rejected[0].reason, /source/)
})

test('a factoid citing a host that never appeared in search results is discarded', () => {
  const { accepted, rejected } = validateFactoids(
    [good({ source_url: 'https://invented-source.test/page' })], ctx())
  assert.equal(accepted.length, 0, 'an invented citation must not survive')
  assert.match(rejected[0].reason, /host/)
})

test('a subdomain of a searched host is accepted', () => {
  const { accepted } = validateFactoids(
    [good({ source_url: 'https://www.rollingstone.com/x' })], ctx())
  assert.equal(accepted.length, 1)
})

test('a non-https scheme is discarded even when the host matches', () => {
  for (const url of [
    'http://example.com/x',
    'javascript:alert(1)//example.com',
    'data:text/html;base64,PHA+eDwvcD4=',
  ]) {
    const { accepted } = validateFactoids([good({ source_url: url })], ctx())
    assert.equal(accepted.length, 0, `${url} must be discarded`)
  }
})

test('empty or whitespace-only text is discarded', () => {
  for (const text of ['', '   ', undefined]) {
    const { accepted } = validateFactoids([good({ text })], ctx())
    assert.equal(accepted.length, 0)
  }
})

test('text longer than the card limit is discarded', () => {
  const { accepted, rejected } = validateFactoids([good({ text: 'x'.repeat(MAX_FACTOID_LENGTH + 1) })], ctx())
  assert.equal(accepted.length, 0)
  assert.match(rejected[0].reason, /length/)
})

test('em-dashes are stripped from accepted text', () => {
  const { accepted } = validateFactoids(
    [good({ text: 'Recorded in Muscle Shoals — in one night.' })], ctx())
  assert.equal(accepted.length, 1)
  assert.ok(!accepted[0].text.includes('—'), 'no em-dash may reach the UI')
  assert.equal(accepted[0].text, 'Recorded in Muscle Shoals, in one night.')
})

test('a track-scoped factoid resolves its track title to a track id', () => {
  const { accepted } = validateFactoids(
    [good({ scope: 'track', track_title: 'deacon blues' })], ctx())
  assert.equal(accepted.length, 1)
  assert.equal(accepted[0].kind, 'track')
  assert.equal(accepted[0].targetId, 101)
})

test('an unresolvable track title is discarded rather than guessed at', () => {
  const { accepted, rejected } = validateFactoids(
    [good({ scope: 'track', track_title: 'Not On This Record' })], ctx())
  assert.equal(accepted.length, 0)
  assert.match(rejected[0].reason, /track/)
})

test('a track-scoped factoid with no track_title is discarded', () => {
  const { accepted } = validateFactoids([good({ scope: 'track' })], ctx())
  assert.equal(accepted.length, 0)
})

test('an unknown scope is discarded', () => {
  const { accepted } = validateFactoids([good({ scope: 'label' })], ctx())
  assert.equal(accepted.length, 0)
})

test('a scope that does not match the generation kind is discarded', () => {
  // An album generation may emit album- and track-scoped factoids only.
  const { accepted } = validateFactoids([good({ scope: 'artist' })], ctx({ kind: 'album' }))
  assert.equal(accepted.length, 0)
})

test('an artist generation accepts only artist-scoped factoids', () => {
  const artistCtx = ctx({ kind: 'artist', targetId: 7, tracklist: [] })
  assert.equal(validateFactoids([good({ scope: 'artist' })], artistCtx).accepted.length, 1)
  assert.equal(validateFactoids([good({ scope: 'album' })], artistCtx).accepted.length, 0)
})

test('a duplicate of an existing stored factoid is discarded', () => {
  const { accepted, rejected } = validateFactoids(
    [good({ text: 'The  HORN solo was cut in a single take!' })],
    ctx({ existingTexts: ['The horn solo was cut in a single take.'] }),
  )
  assert.equal(accepted.length, 0)
  assert.match(rejected[0].reason, /duplicate/)
})

test('two identical factoids in one batch keep only the first', () => {
  const { accepted } = validateFactoids([good(), good()], ctx())
  assert.equal(accepted.length, 1)
})

test('per-scope caps are enforced', () => {
  const many = Array.from({ length: 10 }, (_, i) => good({ text: `Fact number ${i} about the record.` }))
  const { accepted } = validateFactoids(many, ctx())
  assert.equal(accepted.length, 6, 'album cap is 6')
})

test('the track cap is one per track', () => {
  const submitted = [
    good({ scope: 'track', track_title: 'Josie', text: 'First thing about Josie.' }),
    good({ scope: 'track', track_title: 'Josie', text: 'Second thing about Josie.' }),
  ]
  const { accepted } = validateFactoids(submitted, ctx())
  assert.equal(accepted.length, 1)
})

test('a non-array submission is handled without throwing', () => {
  const { accepted } = validateFactoids(null as never, ctx())
  assert.equal(accepted.length, 0)
})

test('helpers behave as the validator relies on', () => {
  assert.equal(hostOf('https://www.example.com/a'), 'www.example.com')
  assert.equal(hostOf('not a url'), null)
  assert.equal(sanitizeText('  a — b  '), 'a, b')
  assert.equal(normalizeForDedupe('The  HORN solo!'), 'the horn solo')
})

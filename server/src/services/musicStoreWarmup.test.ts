import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'fs'
import os from 'os'
import path from 'path'
import { createMusicStoreWarmer, readRandomBlock } from './musicStoreWarmup.js'

const deferred = () => {
  let resolve!: () => void
  const promise = new Promise<void>((r) => { resolve = r })
  return { promise, resolve }
}

test('warm() reads a block from a randomly picked file', async () => {
  const reads: string[] = []
  const warmer = createMusicStoreWarmer({
    pickFile: async () => '/music/a.mp3',
    readBlock: async (p) => { reads.push(p) },
    now: () => 0,
  })
  assert.equal(warmer.warm(), true)
  await warmer.idle()
  assert.deepEqual(reads, ['/music/a.mp3'])
})

test('only one warm-up runs at a time', async () => {
  const gate = deferred()
  let reads = 0
  const warmer = createMusicStoreWarmer({
    pickFile: async () => '/music/a.mp3',
    readBlock: async () => { reads++; await gate.promise },
    now: () => 0,
    cooldownMs: 0,
  })
  assert.equal(warmer.warm(), true)
  assert.equal(warmer.warm(), false)
  gate.resolve()
  await warmer.idle()
  assert.equal(reads, 1)
})

test('a finished warm-up holds off further ones for the cooldown', async () => {
  let clock = 1000
  let reads = 0
  const warmer = createMusicStoreWarmer({
    pickFile: async () => '/music/a.mp3',
    readBlock: async () => { reads++ },
    now: () => clock,
    cooldownMs: 60_000,
  })
  warmer.warm()
  await warmer.idle()
  clock += 30_000
  assert.equal(warmer.warm(), false)
  clock += 31_000
  assert.equal(warmer.warm(), true)
  await warmer.idle()
  assert.equal(reads, 2)
})

test('failures are swallowed and do not start the cooldown', async () => {
  let attempts = 0
  const warmer = createMusicStoreWarmer({
    pickFile: async () => { attempts++; throw new Error('db down') },
    readBlock: async () => {},
    now: () => 0,
    cooldownMs: 60_000,
    log: () => {},
  })
  warmer.warm()
  await warmer.idle()
  assert.equal(warmer.warm(), true)
  await warmer.idle()
  assert.equal(attempts, 2)
})

test('no file to read is not an error', async () => {
  const warmer = createMusicStoreWarmer({
    pickFile: async () => null,
    readBlock: async () => { throw new Error('should not read') },
    now: () => 0,
  })
  warmer.warm()
  await warmer.idle()
})

test('readRandomBlock reads from inside the file', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'warm-'))
  const file = path.join(dir, 'f.bin')
  fs.writeFileSync(file, Buffer.alloc(100_000, 7))
  try {
    for (let i = 0; i < 20; i++) {
      const bytes = await readRandomBlock(file)
      assert.ok(bytes > 0 && bytes <= 4096)
    }
    const empty = path.join(dir, 'empty.bin')
    fs.writeFileSync(empty, '')
    assert.equal(await readRandomBlock(empty), 0)
  } finally {
    fs.rmSync(dir, { recursive: true, force: true })
  }
})

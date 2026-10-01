import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'fs'
import os from 'os'
import path from 'path'
import { checkMediaFiles } from './mediaFileStatus.js'

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mediafilestatus-'))
const good = path.join(dir, 'good.mp3')
const empty = path.join(dir, 'empty.mp3')
fs.writeFileSync(good, 'ID3data')
fs.writeFileSync(empty, '')

test('reports ok, missing, empty and unknown from what is really on disk', async () => {
  const status = await checkMediaFiles([
    { id: 1, absolute_path: good },
    { id: 2, absolute_path: path.join(dir, 'gone.mp3') },
    { id: 3, absolute_path: empty },
    { id: 4, absolute_path: null },
    { id: 5, absolute_path: dir }, // a directory is not a playable file
  ])
  assert.deepEqual([...status.entries()].sort((a, b) => a[0] - b[0]), [[1, 'ok'], [2, 'missing'], [3, 'empty'], [4, 'unknown'], [5, 'missing']])
})

test('trusts the file_missing flag without touching the disk, even if a file is present', async () => {
  const status = await checkMediaFiles([{ id: 1, absolute_path: good, file_missing: true }])
  assert.equal(status.get(1), 'missing')
})

test('a path under a regular file (ENOTDIR) is missing, not unreadable', async () => {
  const status = await checkMediaFiles([{ id: 1, absolute_path: path.join(good, 'nested.mp3') }])
  assert.equal(status.get(1), 'missing')
})

test('skip mode (audio share not mounted) marks everything unknown instead of falsely missing', async () => {
  const status = await checkMediaFiles([{ id: 1, absolute_path: path.join(dir, 'gone.mp3') }, { id: 2, absolute_path: good }], { skip: true })
  assert.deepEqual([...status.values()], ['unknown', 'unknown'])
})

test('checks many files with bounded concurrency and returns every result', async () => {
  const files = Array.from({ length: 100 }, (_, i) => ({ id: i, absolute_path: i % 2 ? good : path.join(dir, `none-${i}.mp3`) }))
  const status = await checkMediaFiles(files)
  assert.equal(status.size, 100)
  assert.equal([...status.values()].filter((s) => s === 'ok').length, 50)
  assert.equal([...status.values()].filter((s) => s === 'missing').length, 50)
})

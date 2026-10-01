import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'fs'
import os from 'os'
import path from 'path'
import { pipeFile, type AbortableWriter } from './pipeFile.js'

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pipefile-'))
const file = path.join(dir, 'big.bin')
// 4 MB, many 64 KB chunks, so an abort has plenty of file left to not read
fs.writeFileSync(file, Buffer.alloc(4 * 1024 * 1024, 1))

const makeWriter = (onWrite?: (writer: FakeWriter, total: number) => void) => {
  const writer: FakeWriter = {
    aborted: false,
    written: 0,
    listeners: [],
    async write(chunk) {
      writer.written += chunk.length
      onWrite?.(writer, writer.written)
    },
    onAbort(l) { writer.listeners.push(l) },
    abort() { writer.aborted = true; writer.listeners.forEach((l) => l()) },
  }
  return writer
}
type FakeWriter = AbortableWriter & { written: number; listeners: (() => void)[]; abort(): void }

test('writes the whole file when the client stays connected', async () => {
  const w = makeWriter()
  await pipeFile(w, file)
  assert.equal(w.written, 4 * 1024 * 1024)
})

test('honours a byte range', async () => {
  const w = makeWriter()
  await pipeFile(w, file, { start: 100, end: 1099 })
  assert.equal(w.written, 1000)
})

test('stops reading and releases the file as soon as the client disconnects', async () => {
  let opened: fs.ReadStream | undefined
  const open = ((...args: Parameters<typeof fs.createReadStream>) => (opened = fs.createReadStream(...args))) as typeof fs.createReadStream
  const w = makeWriter((writer, total) => { if (total >= 128 * 1024) writer.abort() })

  await pipeFile(w, file, undefined, open)

  assert.ok(w.written < 1024 * 1024, `should stop shortly after the abort, wrote ${w.written} of ${4 * 1024 * 1024}`)
  assert.equal(opened!.destroyed, true, 'the file handle is closed')
})

test('a client that disconnects before the first chunk reads nothing', async () => {
  let opened: fs.ReadStream | undefined
  const open = ((...args: Parameters<typeof fs.createReadStream>) => (opened = fs.createReadStream(...args))) as typeof fs.createReadStream
  const w = makeWriter()
  w.abort()
  await pipeFile(w, file, undefined, open)
  assert.equal(w.written, 0)
  assert.equal(opened!.destroyed, true)
})

test('a real read error still propagates when the client is connected', async () => {
  const w = makeWriter()
  await assert.rejects(pipeFile(w, path.join(dir, 'does-not-exist.bin')), /ENOENT/)
})

import fs from 'fs'

// The slice of Hono's StreamingApi that matters here. Its write() swallows every error
// (empty catch), so after a client disconnects it cheerfully "succeeds" forever.
export type AbortableWriter = {
  aborted: boolean
  write(chunk: Uint8Array): Promise<unknown>
  onAbort(listener: () => void): void
}

// Streams a file to the client and STOPS when the client goes away. Without this, a
// browser that abandons or cancels an audio request (a paused preview, a seek, a closed
// tab) leaves the handler reading the whole file off the NAS into the void, holding the
// file handle until the end of the file. A few dozen of those exhausts file handles and
// NAS throughput, and playback elsewhere stalls.
export async function pipeFile(
  writer: AbortableWriter,
  filePath: string,
  range?: { start: number; end: number },
  open: typeof fs.createReadStream = fs.createReadStream,
): Promise<void> {
  const readStream = open(filePath, range)
  writer.onAbort(() => readStream.destroy())
  try {
    for await (const chunk of readStream) {
      if (writer.aborted) break
      await writer.write(chunk)
    }
  } catch (err) {
    // destroy() on abort surfaces as a premature-close error; that is expected, not a failure
    if (!writer.aborted) throw err
  } finally {
    readStream.destroy()
  }
}

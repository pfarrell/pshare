// Reads a request body as JSON, but never buffers more than maxBytes: an
// over-limit Content-Length is rejected up front, and otherwise the stream is
// read chunk by chunk and cancelled the moment the running total passes the
// limit, so a hostile body cannot make the server hold it all in memory before
// any validation runs.
export type BoundedJson =
  | { ok: true; value: unknown }
  | { ok: false; reason: 'too-large' | 'invalid' }

export async function readJsonBounded(request: Request, maxBytes: number): Promise<BoundedJson> {
  const declared = Number(request.headers.get('content-length'))
  if (Number.isFinite(declared) && declared > maxBytes) return { ok: false, reason: 'too-large' }

  if (!request.body) return { ok: false, reason: 'invalid' }

  const reader = request.body.getReader()
  const chunks: Uint8Array[] = []
  let total = 0
  try {
    for (;;) {
      const { value, done } = await reader.read()
      if (done) break
      total += value.byteLength
      if (total > maxBytes) {
        await reader.cancel().catch(() => {})
        return { ok: false, reason: 'too-large' }
      }
      chunks.push(value)
    }
  } catch {
    return { ok: false, reason: 'invalid' }
  }

  try {
    return { ok: true, value: JSON.parse(Buffer.concat(chunks).toString('utf8')) }
  } catch {
    return { ok: false, reason: 'invalid' }
  }
}

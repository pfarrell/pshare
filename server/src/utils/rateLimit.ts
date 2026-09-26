// A minimal fixed-window limiter — cheap abuse protection, not a precise
// sliding-window implementation. Good enough for "don't let one QR-code
// token spam hundreds of submissions a minute."
export function createFixedWindowLimiter(limit: number, windowMs: number): (key: string) => boolean {
  const windows = new Map<string, { count: number; windowStart: number }>()

  return (key: string): boolean => {
    const now = Date.now()
    const entry = windows.get(key)

    if (!entry || now - entry.windowStart >= windowMs) {
      windows.set(key, { count: 1, windowStart: now })
      return true
    }

    if (entry.count >= limit) return false

    entry.count += 1
    return true
  }
}

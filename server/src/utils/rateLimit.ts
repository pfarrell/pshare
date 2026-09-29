// A minimal fixed-window limiter — cheap abuse protection, not a precise
// sliding-window implementation. Good enough for "don't let one QR-code
// token spam hundreds of submissions a minute." `cost` lets one call consume
// several units (e.g. one unit per track submitted); it defaults to 1.
export function createFixedWindowLimiter(limit: number, windowMs: number): (key: string, cost?: number) => boolean {
  const windows = new Map<string, { count: number; windowStart: number }>()

  return (key: string, cost = 1): boolean => {
    const now = Date.now()
    const entry = windows.get(key)

    if (!entry || now - entry.windowStart >= windowMs) {
      if (cost > limit) return false
      windows.set(key, { count: cost, windowStart: now })
      return true
    }

    if (entry.count + cost > limit) return false

    entry.count += cost
    return true
  }
}

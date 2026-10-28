// The stop-word-filtered form of a search query that the fuzzy (pg_trgm)
// branch of library search compares against. Shared by library search and
// the Spotify search scorer so both rank against the same string.

const STOP_WORDS = new Set([
  'a', 'an', 'and', 'are', 'as', 'at', 'be', 'by', 'for', 'from',
  'has', 'he', 'in', 'is', 'it', 'its', 'of', 'on', 'that', 'the',
  'to', 'was', 'will', 'with',
])

export function filterQuery(q: string): string {
  return q
    .replace(/[^\w\s]/g, '')
    .toLowerCase()
    .split(/\s+/)
    .filter((w) => w && !STOP_WORDS.has(w))
    .join(' ')
}

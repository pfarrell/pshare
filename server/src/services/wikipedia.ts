// Wikipedia summary service with in-memory cache.
// Mirrors the Ruby Info class behaviour: fetches the first 4 sentences
// (or up to the first newline) from the Wikipedia API.

interface WikiSummary {
  summary: string
  url: string
}

import { errorLogService } from './errorLogService.js'

const cache = new Map<string, WikiSummary | null>()

// A hung Wikipedia request must not pin a lookup (and, before withDeadline,
// the page load behind it) indefinitely.
const FETCH_TIMEOUT_MS = 3000

// How long a page response will wait on a Wikipedia lookup before giving up
// and sending the page without a summary.
export const SUMMARY_DEADLINE_MS = 1000

// Resolves to the lookup's result, or null if it takes longer than `ms`. The
// lookup is NOT cancelled: it keeps running and fills the cache, so the next
// view of the same album/artist gets its summary instantly. Page loads (and,
// in the jukebox, track starts) never wait on Wikipedia longer than this.
export function withDeadline<T>(lookup: Promise<T | null>, ms: number = SUMMARY_DEADLINE_MS): Promise<T | null> {
  let timer: ReturnType<typeof setTimeout>
  const deadline = new Promise<null>((resolve) => {
    timer = setTimeout(() => resolve(null), ms)
  })
  // A lookup that rejects after the deadline already won must not become an unhandled rejection.
  lookup.catch(() => {})
  return Promise.race([lookup.catch(() => null), deadline]).finally(() => clearTimeout(timer))
}

// Cut a raw extract down to a short summary: first paragraph break, or first
// 4 sentences if there isn't one. Shared by the plain-title and section lookups
// so both produce summaries of similar length/shape.
function truncateToSummary(raw: string): string {
  const newlineIdx = raw.indexOf('\n')
  if (newlineIdx !== -1) return raw.slice(0, newlineIdx)
  const sentences = raw.split('. ')
  return sentences.length > 4 ? sentences.slice(0, 4).join('. ') : raw
}

async function fetchWikipedia(title: string): Promise<WikiSummary | null> {
  const encoded = encodeURIComponent(title)
  const url = `https://en.wikipedia.org/api/rest_v1/page/summary/${encoded}`

  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': 'bemused-music-app/1.0' },
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    })
    if (!res.ok) return null

    const data = await res.json() as any
    const raw: string = (data.extract ?? '').trim()
    if (!raw) return null

    const summary = truncateToSummary(raw)

    return { summary, url: data.content_urls?.desktop?.page ?? `https://en.wikipedia.org/wiki/${encoded}` }
  } catch (err) {
    errorLogService.record({ source: 'wikipedia', message: (err as Error).message, context: title })
    return null
  }
}

function stripTags(s: string): string {
  return s.replace(/<[^>]+>/g, '')
}

// Split an admin-entered slug like "Title#Section_Anchor" into page + fragment.
function splitFragment(raw: string): { base: string; fragment: string | null } {
  const idx = raw.indexOf('#')
  if (idx === -1) return { base: raw, fragment: null }
  const fragment = raw.slice(idx + 1)
  return { base: raw.slice(0, idx), fragment: fragment || null }
}

// Fetch the summary of a single section of a page, identified by its URL fragment.
// The REST summary endpoint has no concept of sections, so this uses two calls to
// the MediaWiki action API: one to resolve the fragment to a section heading, one
// to pull the full plain-text extract (same underlying extraction as the intro
// summary) and slice out the text under that heading.
async function fetchWikipediaSection(base: string, fragment: string): Promise<WikiSummary | null> {
  try {
    const sectionsUrl = new URL('https://en.wikipedia.org/w/api.php')
    sectionsUrl.searchParams.set('action', 'parse')
    sectionsUrl.searchParams.set('format', 'json')
    sectionsUrl.searchParams.set('formatversion', '2')
    sectionsUrl.searchParams.set('prop', 'sections')
    sectionsUrl.searchParams.set('page', base)
    const sectionsRes = await fetch(sectionsUrl, { headers: { 'User-Agent': 'bemused-music-app/1.0' } })
    if (!sectionsRes.ok) return null
    const sectionsData = await sectionsRes.json() as any
    if (sectionsData.error) return null
    const sections: any[] = sectionsData.parse?.sections ?? []
    if (sections.length === 0) return null

    let decodedFragment = fragment
    try {
      decodedFragment = decodeURIComponent(fragment)
    } catch {
      // fragment wasn't percent-encoded; use as-is
    }

    const match = sections.find((s) => s.anchor === fragment || s.anchor === decodedFragment)
    if (!match) return null
    const headingText = stripTags(match.line ?? '').trim()
    if (!headingText) return null

    const extractUrl = new URL('https://en.wikipedia.org/w/api.php')
    extractUrl.searchParams.set('action', 'query')
    extractUrl.searchParams.set('format', 'json')
    extractUrl.searchParams.set('formatversion', '2')
    extractUrl.searchParams.set('prop', 'extracts')
    extractUrl.searchParams.set('explaintext', '1')
    extractUrl.searchParams.set('exsectionformat', 'plain')
    extractUrl.searchParams.set('titles', base)
    const extractRes = await fetch(extractUrl, { headers: { 'User-Agent': 'bemused-music-app/1.0' } })
    if (!extractRes.ok) return null
    const extractData = await extractRes.json() as any
    const page = extractData.query?.pages?.[0]
    const fullText: string = page?.extract ?? ''
    if (!fullText) return null

    // Headings sit on their own line, set off from surrounding paragraphs by a
    // blank line on each side — splitting on the triple newline isolates them.
    const blocks = fullText.split('\n\n\n')
    for (const block of blocks.slice(1)) {
      const nlIdx = block.indexOf('\n')
      if (nlIdx === -1) continue
      const blockHeading = block.slice(0, nlIdx).trim()
      if (blockHeading !== headingText) continue
      const body = block.slice(nlIdx + 1).trim()
      if (!body) return null
      const summary = truncateToSummary(body)
      const url = encodeURI(`https://en.wikipedia.org/wiki/${base}#${fragment}`)
      return { summary, url }
    }
    return null
  } catch (err) {
    errorLogService.record({ source: 'wikipedia', message: (err as Error).message, context: `${base}#${fragment}` })
    return null
  }
}

// Resolve an admin-entered override, which may carry a "#section" fragment.
// Tries the section-scoped summary first; any miss (no match, empty section,
// fetch error) falls back to the plain page-title summary.
async function resolveOverride(rawOverride: string): Promise<WikiSummary | null> {
  const { base, fragment } = splitFragment(normalizeQuotes(rawOverride))
  if (fragment) {
    const sectioned = await fetchWikipediaSection(base, fragment)
    if (sectioned) return sectioned
  }
  return tryTitles([base])
}

// Try a list of candidate titles, return the first hit in list order. Uncached
// candidates are fetched concurrently (one round trip instead of up to four in
// a row); a higher-priority candidate still wins over a faster lower one.
async function tryTitles(titles: string[]): Promise<WikiSummary | null> {
  const lookups = titles.map(async (title) => {
    const key = title.toLowerCase()
    if (cache.has(key)) return cache.get(key) ?? null
    const result = await fetchWikipedia(title)
    cache.set(key, result)
    return result
  })
  for (const lookup of lookups) {
    const result = await lookup
    if (result) return result
  }
  return null
}

// Mobile keyboards (iOS Safari smart punctuation) silently substitute
// typographic quotes for straight ones as an admin types. Wikipedia's API
// matches article slugs exactly, so a stray curly quote 404s where a
// straight one would 200 — normalize before it ever reaches the API.
function normalizeQuotes(name: string): string {
  return name.replace(/[‘’]/g, "'").replace(/[“”]/g, '"')
}

// Mirror Ruby's wp_fix: replace & with "and", strip parens
function wpFix(name: string): string {
  return normalizeQuotes(name).replace(/&/g, 'and').replace(/\s*\(.*?\)/g, '').trim()
}

// Candidate names for an artist: exact, fixed, "Name (band)", "Name (musician)"
function artistCandidates(name: string): string[] {
  const fixed = wpFix(name)
  return [fixed, `${fixed} (band)`, `${fixed} (musician)`, `${fixed} (singer)`]
}

// Candidate titles for an album: "Artist – Album", "Album (album)"
function albumCandidates(
  artistName: string,
  albumTitle: string,
  artistWikipedia?: string | null
): string[] {
  const artist = artistWikipedia ? wpFix(artistWikipedia) : wpFix(artistName)
  const title = wpFix(albumTitle)
  return [`${title} (${artist} album)`, `${title} (album)`, title]
}

export async function getArtistSummary(
  name: string,
  wikipediaOverride?: string | null
): Promise<WikiSummary | null> {
  if (wikipediaOverride) return resolveOverride(wikipediaOverride)
  return tryTitles(artistCandidates(name))
}

export async function getAlbumSummary(
  artistName: string,
  albumTitle: string,
  artistWikipedia?: string | null,
  albumWikipedia?: string | null
): Promise<WikiSummary | null> {
  if (albumWikipedia) return resolveOverride(albumWikipedia)
  return tryTitles(albumCandidates(artistName, albumTitle, artistWikipedia))
}

// Collections are user-curated, not canonical entities — there is no
// name-based guessing here, only an explicit admin-set title is ever looked up.
export async function getCollectionSummary(
  title?: string | null
): Promise<WikiSummary | null> {
  if (!title) return null
  return resolveOverride(title)
}

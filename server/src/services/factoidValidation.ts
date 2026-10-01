// server/src/services/factoidValidation.ts
// The cite-or-discard chokepoint. Pure by design: no DB, no model, no I/O, so
// every rule below is cheap to test directly. This is the direct analogue of
// how playlistGeneratorService filters finalize_playlist's ids against
// confirmedTrackIds rather than trusting the model's own output.
// Spec: docs/superpowers/specs/2026-09-30-factoid-screensaver-design.md

// Long enough for a real fact, short enough to fit a kiosk card unscrolled.
export const MAX_FACTOID_LENGTH = 240
export const CAPS = { artist: 6, album: 6, track: 1 } as const

export interface SubmittedFactoid {
  text?: unknown
  source_url?: unknown
  source_title?: unknown
  scope?: unknown
  track_title?: unknown
}

export interface AcceptedFactoid {
  kind: 'artist' | 'album' | 'track'
  targetId: number
  text: string
  sourceUrl: string
  sourceTitle: string | null
}

export interface ValidationContext {
  kind: 'artist' | 'album'
  targetId: number
  // Hosts seen in web_search_tool_result blocks during this run. A factoid
  // whose citation host is not in here is treated as invented.
  searchHosts: Set<string>
  tracklist: { id: number, title: string }[]
  existingTexts: string[]
}

// Em-dashes are banned in this app's text. ", " keeps the sentence readable
// where a bare hyphen would read as a compound word.
export function sanitizeText(raw: string): string {
  return raw.replace(/\s*—\s*/g, ', ').replace(/\s+/g, ' ').trim()
}

// Duplicate detection is deliberately exact-after-normalizing, not fuzzy: the
// job is catching the same fact resubmitted on a re-research, not adjudicating
// paraphrase.
export function normalizeForDedupe(text: string): string {
  return text.toLowerCase().replace(/[^a-z0-9\s]/g, '').replace(/\s+/g, ' ').trim()
}

export function hostOf(url: string): string | null {
  try {
    return new URL(url).hostname.toLowerCase()
  } catch {
    return null
  }
}

// Accepts the exact host or any subdomain of a searched host. Citing
// www.rollingstone.com when the search returned rollingstone.com is the same
// source; citing invented-source.test is not.
function hostIsCited(host: string, searchHosts: Set<string>): boolean {
  if (searchHosts.has(host)) return true
  for (const cited of searchHosts) {
    if (host.endsWith(`.${cited}`) || cited.endsWith(`.${host}`)) return true
  }
  return false
}

const foldTitle = (s: string) =>
  s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]/g, '')

export function validateFactoids(
  submitted: SubmittedFactoid[],
  ctx: ValidationContext,
): { accepted: AcceptedFactoid[], rejected: { reason: string, text: string }[] } {
  const accepted: AcceptedFactoid[] = []
  const rejected: { reason: string, text: string }[] = []
  if (!Array.isArray(submitted)) return { accepted, rejected }

  const seen = new Set(ctx.existingTexts.map(normalizeForDedupe))
  const counts = { artist: 0, album: 0, track: 0 }
  const usedTracks = new Set<number>()
  // An artist run may only produce artist facts; an album run may produce
  // album facts and track facts about songs on that album.
  const allowedScopes = ctx.kind === 'artist' ? ['artist'] : ['album', 'track']

  for (const raw of submitted) {
    const text = typeof raw?.text === 'string' ? sanitizeText(raw.text) : ''
    const reject = (reason: string) => rejected.push({ reason, text })

    if (!text) { reject('empty text'); continue }
    if (text.length > MAX_FACTOID_LENGTH) { reject(`length over ${MAX_FACTOID_LENGTH}`); continue }

    const scope = raw?.scope
    if (typeof scope !== 'string' || !allowedScopes.includes(scope)) {
      reject(`scope not allowed for a ${ctx.kind} generation`); continue
    }

    const sourceUrl = typeof raw?.source_url === 'string' ? raw.source_url.trim() : ''
    if (!sourceUrl) { reject('missing source_url'); continue }
    let parsed: URL
    try {
      parsed = new URL(sourceUrl)
    } catch {
      reject('source_url is not a URL'); continue
    }
    // https only. The host is rendered as attribution and linked in the admin
    // panel, so javascript:, data:, and plain http: are all refused here.
    if (parsed.protocol !== 'https:') { reject('source_url is not https'); continue }
    if (!hostIsCited(parsed.hostname.toLowerCase(), ctx.searchHosts)) {
      reject('source_url host was never returned by web search'); continue
    }

    const key = normalizeForDedupe(text)
    if (seen.has(key)) { reject('duplicate text'); continue }

    let kind: AcceptedFactoid['kind']
    let targetId: number
    if (scope === 'track') {
      const wanted = typeof raw?.track_title === 'string' ? foldTitle(raw.track_title) : ''
      if (!wanted) { reject('track scope with no track_title'); continue }
      const match = ctx.tracklist.find((t) => foldTitle(t.title) === wanted)
      if (!match) { reject('track_title does not match any track on this album'); continue }
      if (usedTracks.has(match.id)) { reject('track already has a factoid this run'); continue }
      kind = 'track'
      targetId = match.id
    } else {
      kind = scope as 'artist' | 'album'
      targetId = ctx.targetId
    }

    if (counts[kind] >= CAPS[kind] && kind !== 'track') { reject(`cap of ${CAPS[kind]} reached`); continue }

    seen.add(key)
    counts[kind] += 1
    if (kind === 'track') usedTracks.add(targetId)
    accepted.push({
      kind, targetId, text, sourceUrl,
      sourceTitle: typeof raw?.source_title === 'string' && raw.source_title.trim()
        ? raw.source_title.trim() : null,
    })
  }

  return { accepted, rejected }
}

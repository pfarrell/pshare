// server/src/services/spotifyLibraryMatch.ts
// Library awareness for GET /search/spotify (#72, experimental — the whole
// Spotify integration may be ripped out later, so everything it needs beyond
// the Spotify client itself lives here):
//   - annotates each Spotify track/album/artist with `localId`, the id of the
//     matching P·Share row anywhere in the library (not just the current
//     search page), so the frontend can hide what the library already owns;
//   - drops Spotify artists unrelated to the query (Spotify pads artist
//     results with "similar" names like R.E.M. for "radiohead").
//
// Matching is exact on a normalized key, never fuzzy: a false positive would
// hide a genuinely different release. Normalization happens in TS (not SQL)
// so it's guaranteed identical to normalizeForMatch on the frontend and
// independent of the database's locale; SQL only fetches a superset of
// candidates via ILIKE.
import { Kysely, sql } from 'kysely'
import { db, Database } from '../db/database.js'
import type { SpotifyAlbum, SpotifyArtist, SpotifySearchResult, SpotifyTrack } from './spotify.js'

export type WithLocalId<T> = T & { localId: number | null }

export interface AnnotatedSpotifyResult {
  tracks: WithLocalId<SpotifyTrack>[]
  albums: WithLocalId<SpotifyAlbum>[]
  artists: WithLocalId<SpotifyArtist>[]
}

// Lowercase, collapse every run of non-letter/non-digit chars (Unicode-aware)
// to one space, trim. Must stay identical to the frontend's normalizeForMatch.
export function normalizeForMatch(value: unknown): string {
  if (typeof value !== 'string') return ''
  return value
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim()
}

// Relevance only (not library matching): also folds diacritics, so a query
// typed without accents ("sigur ros") still keeps "Sigur Rós".
function normalizeForRelevance(value: unknown): string {
  return normalizeForMatch(typeof value === 'string' ? value.normalize('NFD').replace(/\p{M}+/gu, '') : value)
}

const hasWord = (haystack: string, needle: string) => ` ${haystack} `.includes(` ${needle} `)

// Keep an artist when its name contains the query, the query contains its
// name as whole words, or every query token is a whole word of the name.
// The middle rule is whole-word (not substring) so "radiohead" doesn't keep
// artists named "Radio" or "Head".
export function isRelevantArtist(name: unknown, query: string): boolean {
  const n = normalizeForRelevance(name)
  const q = normalizeForRelevance(query)
  if (!q) return true
  if (!n) return false
  if (n.includes(q) || hasWord(q, n)) return true
  return q.split(' ').every((token) => hasWord(n, token))
}

export function filterRelevantArtists<T extends { name: string }>(artists: T[], query: string): T[] {
  return artists.filter((a) => isRelevantArtist(a.name, query))
}

// ILIKE pattern matching every string whose normalized form equals `name`'s
// (a superset — the exact check happens in TS). Tokens are letters/digits
// only, so they can't contain LIKE metacharacters. null when nothing's left.
export function likePatternFor(name: unknown): string | null {
  const key = normalizeForMatch(name)
  return key ? `%${key.split(' ').join('%')}%` : null
}

const uniquePatterns = (names: unknown[]) =>
  [...new Set(names.map(likePatternFor).filter((p): p is string => p !== null))]

const pairKey = (title: string, artist: string) => `${title}|${artist}`

// Normalized key → smallest matching id, so repeated lookups are deterministic.
function indexRows<R extends { id: number }>(rows: R[], key: (r: R) => string | null): Map<string, number> {
  const map = new Map<string, number>()
  for (const row of rows) {
    const k = key(row)
    if (!k) continue
    const prev = map.get(k)
    if (prev === undefined || row.id < prev) map.set(k, row.id)
  }
  return map
}

export interface LibraryCandidateRows {
  artists: { id: number; name: string }[]
  albums: { id: number; title: string; artist_name: string }[]
  tracks: { id: number; title: string; artist_name: string }[]
}

// First Spotify artist (in Spotify's order) with a library match wins.
function matchByTitleAndArtists(index: Map<string, number>, title: string, artists: { name: string }[]): number | null {
  const t = normalizeForMatch(title)
  if (!t) return null
  for (const a of artists) {
    const id = index.get(pairKey(t, normalizeForMatch(a?.name)))
    if (id !== undefined) return id
  }
  return null
}

// Pure: given candidate library rows (any superset), attach localIds.
export function assignLocalIds(result: SpotifySearchResult, rows: LibraryCandidateRows): AnnotatedSpotifyResult {
  const artistIndex = indexRows(rows.artists, (r) => normalizeForMatch(r.name) || null)
  const albumIndex = indexRows(rows.albums, (r) => {
    const t = normalizeForMatch(r.title)
    return t ? pairKey(t, normalizeForMatch(r.artist_name)) : null
  })
  const trackIndex = indexRows(rows.tracks, (r) => {
    const t = normalizeForMatch(r.title)
    return t ? pairKey(t, normalizeForMatch(r.artist_name)) : null
  })

  return {
    artists: result.artists.map((a) => {
      const key = normalizeForMatch(a.name)
      return { ...a, localId: key ? artistIndex.get(key) ?? null : null }
    }),
    albums: result.albums.map((a) => ({ ...a, localId: matchByTitleAndArtists(albumIndex, a.name, a.artists) })),
    tracks: result.tracks.map((t) => ({ ...t, localId: matchByTitleAndArtists(trackIndex, t.name, t.artists) })),
  }
}

export function withNullLocalIds(result: SpotifySearchResult): AnnotatedSpotifyResult {
  return {
    tracks: result.tracks.map((t) => ({ ...t, localId: null })),
    albums: result.albums.map((a) => ({ ...a, localId: null })),
    artists: result.artists.map((a) => ({ ...a, localId: null })),
  }
}

const ilikeAny = (column: string, patterns: string[]) => sql<boolean>`${sql.ref(column)} ILIKE ANY(${patterns}::text[])`

// Only rows local search can show count as owned: an album with an approved
// track, an artist with one via albums.artist_id or tracks.artist_id (the same
// rules as searchService). Stub rows (e.g. from similar-artist imports) would
// otherwise hide the Spotify result while never appearing locally.
const albumHasApprovedTrack = sql<boolean>`EXISTS (SELECT 1 FROM tracks t WHERE t.album_id = albums.id AND t.approved = true)`
const artistHasApprovedTrack = sql<boolean>`(
  EXISTS (SELECT 1 FROM tracks t WHERE t.artist_id = artists.id AND t.approved = true)
  OR EXISTS (SELECT 1 FROM albums al INNER JOIN tracks t ON t.album_id = al.id AND t.approved = true WHERE al.artist_id = artists.id)
)`

export function createSpotifyLibraryMatcher(db: Kysely<Database>) {
  // At most three queries (run in parallel), each prefiltered on both the
  // title and the artist name so the candidate set stays small.
  async function fetchCandidates(result: SpotifySearchResult): Promise<LibraryCandidateRows> {
    const artistNamesFor = (items: { artists: { name: string }[] }[]) => items.flatMap((i) => i.artists.map((a) => a.name))
    const artistPatterns = uniquePatterns(result.artists.map((a) => a.name))
    const albumTitlePatterns = uniquePatterns(result.albums.map((a) => a.name))
    const albumArtistPatterns = uniquePatterns(artistNamesFor(result.albums))
    const trackTitlePatterns = uniquePatterns(result.tracks.map((t) => t.name))
    const trackArtistPatterns = uniquePatterns(artistNamesFor(result.tracks))

    const [artists, albums, tracks] = await Promise.all([
      artistPatterns.length === 0 ? [] : db
        .selectFrom('artists')
        .select(['id', 'name'])
        .where(ilikeAny('artists.name', artistPatterns))
        .where(artistHasApprovedTrack)
        .execute(),

      albumTitlePatterns.length === 0 || albumArtistPatterns.length === 0 ? [] : db
        // An album's artist is its primary artist_id or any artist_albums credit.
        .selectFrom('albums')
        .innerJoin('artists', 'artists.id', 'albums.artist_id')
        .select(['albums.id as id', 'albums.title as title', 'artists.name as artist_name'])
        .where(ilikeAny('albums.title', albumTitlePatterns))
        .where(ilikeAny('artists.name', albumArtistPatterns))
        .where(albumHasApprovedTrack)
        .union(
          db.selectFrom('albums')
            .innerJoin('artist_albums', 'artist_albums.album_id', 'albums.id')
            .innerJoin('artists', 'artists.id', 'artist_albums.artist_id')
            .select(['albums.id as id', 'albums.title as title', 'artists.name as artist_name'])
            .where(ilikeAny('albums.title', albumTitlePatterns))
            .where(ilikeAny('artists.name', albumArtistPatterns))
            .where(albumHasApprovedTrack),
        )
        .execute(),

      trackTitlePatterns.length === 0 || trackArtistPatterns.length === 0 ? [] : db
        .selectFrom('tracks')
        .innerJoin('artists', 'artists.id', 'tracks.artist_id')
        .select(['tracks.id as id', 'tracks.title as title', 'artists.name as artist_name'])
        .where('tracks.approved', '=', true)
        .where(ilikeAny('tracks.title', trackTitlePatterns))
        .where(ilikeAny('artists.name', trackArtistPatterns))
        .execute(),
    ])

    return { artists, albums, tracks }
  }

  return {
    async annotate(result: SpotifySearchResult): Promise<AnnotatedSpotifyResult> {
      return assignLocalIds(result, await fetchCandidates(result))
    },
  }
}

export const spotifyLibraryMatcher = createSpotifyLibraryMatcher(db)

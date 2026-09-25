import { Hono } from 'hono'
import { searchService, RESULT_LIMIT } from '../services/searchService.js'
import { logService } from '../services/logService.js'
import { extractIpAddress } from '../utils/requestIp.js'
import { profilesService } from '../services/profilesService.js'

const search = new Hono()

const STOP_WORDS = new Set([
  'a', 'an', 'and', 'are', 'as', 'at', 'be', 'by', 'for', 'from',
  'has', 'he', 'in', 'is', 'it', 'its', 'of', 'on', 'that', 'the',
  'to', 'was', 'will', 'with',
])

function filterQuery(q: string): string {
  return q
    .replace(/[^\w\s]/g, '')
    .toLowerCase()
    .split(/\s+/)
    .filter((w) => w && !STOP_WORDS.has(w))
    .join(' ')
}

const QUOTE_CHARS = new Set(['"', '“', '”'])

// Whole-query quoting only: "query" (or curly-quote variants, since iOS can
// auto-convert straight quotes) switches from fuzzy similarity matching to
// exact substring matching for the entire request.
export function parseQuoted(rawQuery: string): { query: string; exactOnly: boolean } {
  const trimmed = rawQuery.trim()
  if (
    trimmed.length >= 2 &&
    QUOTE_CHARS.has(trimmed[0]) &&
    QUOTE_CHARS.has(trimmed[trimmed.length - 1])
  ) {
    return { query: trimmed.slice(1, -1).trim(), exactOnly: true }
  }
  return { query: trimmed, exactOnly: false }
}

function parseOffset(raw: string | undefined): number {
  const n = parseInt(raw ?? '0', 10)
  return Number.isFinite(n) && n > 0 ? n : 0
}

const TYPE_KEY_MAP: Record<string, 'album' | 'artist' | 'playlist' | 'collection'> = {
  Album: 'album',
  Artist: 'artist',
  Playlist: 'playlist',
  Collection: 'collection',
}

const EMPTY_RESULT_COUNTS = { album: 0, artist: 0, playlist: 0, collection: 0 }

async function buildRankedResults(likeParam: string, filteredQ: string, exactOnly: boolean, offset: number, tagIds: number[] | null) {
  // Fetch one extra row beyond the page size so we can tell whether another
  // page exists without a separate existence-check query.
  const searchRows = await searchService.runUnionSearch(likeParam, filteredQ, exactOnly, RESULT_LIMIT + 1, offset, tagIds)
  const hasMore = searchRows.length > RESULT_LIMIT
  const pageRows = searchRows.slice(0, RESULT_LIMIT)

  // Dedup by (type, id), keeping the first occurrence — since pageRows is already
  // ordered by score DESC and an exact-branch row (score 2.0) always sorts before a
  // fuzzy-branch row for the same entity, this keeps the exact-match row.
  const orderedRefs: { type: string; id: number }[] = []
  const seen = new Set<string>()
  for (const row of pageRows) {
    const key = `${row.model_type}:${row.id}`
    if (!seen.has(key)) {
      seen.add(key)
      orderedRefs.push({ type: row.model_type, id: row.id })
    }
  }

  const albumIds = orderedRefs.filter((r) => r.type === 'Album').map((r) => r.id)
  const artistIds = orderedRefs.filter((r) => r.type === 'Artist').map((r) => r.id)
  const playlistIds = orderedRefs.filter((r) => r.type === 'Playlist').map((r) => r.id)
  const collectionIds = orderedRefs.filter((r) => r.type === 'Collection').map((r) => r.id)

  const [albums, artists, playlists, collections] = await Promise.all([
    searchService.fetchAlbumsByIds(albumIds),
    searchService.fetchArtistsWithCounts(artistIds),
    searchService.fetchPlaylistsWithCounts(playlistIds),
    searchService.fetchCollectionsByIds(collectionIds),
  ])

  const byType: Record<string, Map<number, any>> = {
    Album: new Map(albums.map((a: any) => [a.id, a])),
    Artist: new Map(artists.map((a: any) => [a.id, a])),
    Playlist: new Map(playlists.map((p: any) => [p.id, p])),
    Collection: new Map(collections.map((c: any) => [c.id, c])),
  }

  const results = orderedRefs
    .map((ref) => {
      const data = byType[ref.type].get(ref.id)
      return data ? { type: TYPE_KEY_MAP[ref.type], data } : null
    })
    .filter((r): r is { type: 'album' | 'artist' | 'playlist' | 'collection'; data: any } => r !== null)

  return { results, hasMore }
}

// GET /search?q=query&offset=0
search.get('/', async (c) => {
  const rawQuery = c.req.query('q') ?? ''
  const { query, exactOnly } = parseQuoted(rawQuery)
  const offset = parseOffset(c.req.query('offset'))

  if (exactOnly ? query.length < 1 : query.length < 3) {
    return c.json({ results: [], hasMore: false, resultCounts: EMPTY_RESULT_COUNTS, tracks: [], count: 0, pageSize: RESULT_LIMIT })
  }

  const filteredQ = exactOnly ? '' : filterQuery(query)
  if (!exactOnly && filteredQ.length < 3) {
    return c.json({ results: [], hasMore: false, resultCounts: EMPTY_RESULT_COUNTS, tracks: [], count: 0, pageSize: RESULT_LIMIT })
  }

  const likeParam = `%${query}%`
  const profileIdParam = c.req.query('profileId')
  let tagIds: number[] | null = null
  if (profileIdParam) {
    const profileId = parseInt(profileIdParam)
    // A profile always carries >=1 tag in practice (enforced at the API
    // layer), so getTagIds() only ever comes back empty for a stale/deleted
    // or malformed profileId — which would otherwise silently empty out
    // Playlist/Collection results too, even though those have no tag
    // concept and must never be filtered. Reject it here instead.
    if (Number.isNaN(profileId) || !(await profilesService.findById(profileId))) {
      return c.json({ error: 'Invalid profileId' }, 400)
    }
    tagIds = await profilesService.getTagIds(profileId)
  }

  // Tracks are unpaginated and unlimited by design (the full match list is
  // fetched on page 1), and resultCounts reflects the query's total, which
  // doesn't change page to page. Neither is used by the frontend on a
  // loadMore (offset > 0) request, so both the full-track-list fetch and the
  // count query are skipped past page 1 — otherwise every scroll page would
  // redundantly re-run and re-serialize an ever-more-wasteful pair of queries
  // whose results are simply discarded by the caller.
  if (offset > 0) {
    const { results, hasMore } = await buildRankedResults(likeParam, filteredQ, exactOnly, offset, tagIds)
    return c.json({ results, hasMore, resultCounts: EMPTY_RESULT_COUNTS, tracks: [], count: results.length, pageSize: RESULT_LIMIT })
  }

  logService
    .record({
      track_id: null,
      album_id: null,
      artist_id: null,
      action: 'search',
      created_at: new Date(),
      ip_address: extractIpAddress(c),
      query: rawQuery.trim().slice(0, 255),
    })
    .catch((err) => console.error('Failed to log search:', err))

  const [{ results, hasMore }, trackIds, rawCounts] = await Promise.all([
    buildRankedResults(likeParam, filteredQ, exactOnly, offset, tagIds),
    searchService.findTrackIds(likeParam, tagIds),
    searchService.countRankedResults(likeParam, filteredQ, exactOnly, tagIds),
  ])

  const resultCounts = {
    album: rawCounts.Album,
    artist: rawCounts.Artist,
    playlist: rawCounts.Playlist,
    collection: rawCounts.Collection,
  }

  const tracks = await searchService.fetchTracksByIds(trackIds, c)

  return c.json({ results, hasMore, resultCounts, tracks, count: results.length + tracks.length, pageSize: RESULT_LIMIT })
})

export default search

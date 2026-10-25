// server/src/services/spotify.ts
// Spotify Web API client (catalog search only). Needs SPOTIFY_CLIENT_ID and
// SPOTIFY_CLIENT_SECRET; uses the Client Credentials flow, so no user login.
// Backs GET /search/spotify (phase 1 of #72). Spotify no longer returns
// preview_url / recommendations for new apps, so nothing here relies on them.

import { normalizeForMatch } from './spotifyLibraryMatch.js'

const TOKEN_URL = 'https://accounts.spotify.com/api/token'
const API = 'https://api.spotify.com/v1'
// Refresh this long before Spotify's stated expiry so a token never expires mid-request.
const TOKEN_EXPIRY_MARGIN_MS = 60_000
// Smallest image at least this wide wins; otherwise the largest available.
const TARGET_IMAGE_PX = 300
const DEFAULT_TYPES: SpotifySearchType[] = ['track', 'album', 'artist']
const DEFAULT_LIMIT = 10

export type SpotifySearchType = 'track' | 'album' | 'artist'

export interface SpotifyArtistRef {
  id: string
  name: string
}

export interface SpotifyTrack {
  uri: string
  id: string
  name: string
  artists: SpotifyArtistRef[]
  album: { id: string; name: string; imageUrl: string | null }
  durationMs: number
  explicit: boolean
  externalUrl: string | null
}

export interface SpotifyAlbum {
  uri: string
  id: string
  name: string
  artists: SpotifyArtistRef[]
  releaseYear: string | null
  totalTracks: number | null
  imageUrl: string | null
  externalUrl: string | null
}

export interface SpotifyArtist {
  uri: string
  id: string
  name: string
  imageUrl: string | null
  externalUrl: string | null
}

export interface SpotifySearchResult {
  tracks: SpotifyTrack[]
  albums: SpotifyAlbum[]
  artists: SpotifyArtist[]
}

export class SpotifyNotConfiguredError extends Error {
  constructor() {
    super('SPOTIFY_CLIENT_ID / SPOTIFY_CLIENT_SECRET are not configured')
    this.name = 'SpotifyNotConfiguredError'
  }
}

export class SpotifyRateLimitError extends Error {
  // Seconds, from Spotify's Retry-After header; null when absent/unparseable.
  constructor(public retryAfter: number | null) {
    super('Spotify rate limit exceeded')
    this.name = 'SpotifyRateLimitError'
  }
}

export class SpotifyApiError extends Error {
  constructor(public status: number, message: string) {
    super(message)
    this.name = 'SpotifyApiError'
  }
}

export function isSpotifyConfigured(): boolean {
  return !!process.env.SPOTIFY_CLIENT_ID && !!process.env.SPOTIFY_CLIENT_SECRET
}

let cachedToken: { value: string; expiresAt: number } | null = null
let inflightToken: Promise<string> | null = null

// Test hook: forget the cached/in-flight token between cases.
export function resetSpotifyTokenCache(): void {
  cachedToken = null
  inflightToken = null
}

async function fetchToken(): Promise<string> {
  const basic = Buffer.from(`${process.env.SPOTIFY_CLIENT_ID}:${process.env.SPOTIFY_CLIENT_SECRET}`).toString('base64')
  const res = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { Authorization: `Basic ${basic}`, 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'client_credentials' }).toString(),
  })
  if (res.status === 429) throw new SpotifyRateLimitError(parseRetryAfter(res))
  if (!res.ok) throw new SpotifyApiError(res.status, `Spotify token error ${res.status}`)
  const data = (await res.json()) as { access_token?: string; expires_in?: number }
  if (!data.access_token) throw new SpotifyApiError(502, 'Spotify token response missing access_token')
  const expiresInMs = (data.expires_in ?? 3600) * 1000
  cachedToken = { value: data.access_token, expiresAt: Date.now() + expiresInMs - TOKEN_EXPIRY_MARGIN_MS }
  return data.access_token
}

// One token fetch at a time: concurrent callers share the in-flight promise.
async function getToken(): Promise<string> {
  if (cachedToken && Date.now() < cachedToken.expiresAt) return cachedToken.value
  if (!inflightToken) {
    inflightToken = fetchToken().finally(() => { inflightToken = null })
  }
  return inflightToken
}

function parseRetryAfter(res: Response): number | null {
  const n = parseInt(res.headers.get('Retry-After') ?? '', 10)
  return Number.isFinite(n) && n >= 0 ? n : null
}

interface RawImage { url?: string | null; width?: number | null; height?: number | null }
interface RawArtist { id?: string; name?: string; uri?: string; images?: RawImage[] | null; external_urls?: { spotify?: string } | null }
interface RawAlbum extends RawArtist { artists?: RawArtist[] | null; release_date?: string | null; total_tracks?: number | null }
interface RawTrack {
  id?: string; name?: string; uri?: string
  artists?: RawArtist[] | null; album?: RawAlbum | null
  duration_ms?: number | null; explicit?: boolean | null
  external_urls?: { spotify?: string } | null
}
interface RawPage<T> { items?: (T | null)[] | null }
interface RawSearchResponse { tracks?: RawPage<RawTrack> | null; albums?: RawPage<RawAlbum> | null; artists?: RawPage<RawArtist> | null }

const str = (v: unknown): string => (typeof v === 'string' ? v : '')

export function pickImageUrl(images: RawImage[] | null | undefined): string | null {
  const usable = (images ?? []).filter((i): i is RawImage & { url: string } => !!i && typeof i.url === 'string' && !!i.url)
  if (usable.length === 0) return null
  const sized = [...usable].sort((a, b) => (a.width ?? 0) - (b.width ?? 0))
  const bigEnough = sized.find((i) => (i.width ?? 0) >= TARGET_IMAGE_PX)
  return (bigEnough ?? sized[sized.length - 1]).url
}

function mapArtistRefs(artists: RawArtist[] | null | undefined): SpotifyArtistRef[] {
  return (artists ?? []).filter(Boolean).map((a) => ({ id: str(a.id), name: str(a.name) }))
}

function mapTrack(t: RawTrack): SpotifyTrack {
  return {
    uri: str(t.uri),
    id: str(t.id),
    name: str(t.name),
    artists: mapArtistRefs(t.artists),
    album: { id: str(t.album?.id), name: str(t.album?.name), imageUrl: pickImageUrl(t.album?.images) },
    durationMs: typeof t.duration_ms === 'number' ? t.duration_ms : 0,
    explicit: t.explicit === true,
    externalUrl: t.external_urls?.spotify || null,
  }
}

function mapAlbum(a: RawAlbum): SpotifyAlbum {
  const year = typeof a.release_date === 'string' ? a.release_date.slice(0, 4) : ''
  return {
    uri: str(a.uri),
    id: str(a.id),
    name: str(a.name),
    artists: mapArtistRefs(a.artists),
    releaseYear: /^\d{4}$/.test(year) ? year : null,
    totalTracks: typeof a.total_tracks === 'number' ? a.total_tracks : null,
    imageUrl: pickImageUrl(a.images),
    externalUrl: a.external_urls?.spotify || null,
  }
}

function mapArtist(a: RawArtist): SpotifyArtist {
  return {
    uri: str(a.uri),
    id: str(a.id),
    name: str(a.name),
    imageUrl: pickImageUrl(a.images),
    externalUrl: a.external_urls?.spotify || null,
  }
}

// Spotify search pages can contain null items; drop those and anything without an id.
function items<T extends { id?: string }>(page: RawPage<T> | null | undefined): T[] {
  return (page?.items ?? []).filter((i): i is T => !!i && typeof i.id === 'string' && !!i.id)
}

export function mapSearchResponse(data: RawSearchResponse | null | undefined): SpotifySearchResult {
  return {
    tracks: items(data?.tracks).map(mapTrack),
    albums: items(data?.albums).map(mapAlbum),
    artists: items(data?.artists).map(mapArtist),
  }
}

// Authenticated GET against the Spotify API with the shared token cache, a
// single 401 retry (a 401 usually means the cached token was revoked/expired
// early: drop it and retry once) and 429 -> SpotifyRateLimitError.
async function spotifyGet<T>(url: string, what: string): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    const token = await getToken()
    const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } })
    if (res.status === 401 && attempt === 0) {
      cachedToken = null
      continue
    }
    if (res.status === 429) throw new SpotifyRateLimitError(parseRetryAfter(res))
    if (!res.ok) throw new SpotifyApiError(res.status, `Spotify ${what} error ${res.status}`)
    return (await res.json()) as T
  }
}

export async function searchSpotify(
  query: string,
  opts: { types?: SpotifySearchType[]; limit?: number } = {},
): Promise<SpotifySearchResult> {
  if (!isSpotifyConfigured()) throw new SpotifyNotConfiguredError()
  const qs = new URLSearchParams({
    q: query,
    type: (opts.types?.length ? opts.types : DEFAULT_TYPES).join(','),
    limit: String(opts.limit ?? DEFAULT_LIMIT),
  })
  return mapSearchResponse(await spotifyGet<RawSearchResponse>(`${API}/search?${qs}`, 'search'))
}

export interface SpotifyAlbumTracks {
  album: { id: string; name: string; imageUrl: string | null; artists: SpotifyArtistRef[] }
  tracks: SpotifyTrack[]
}

interface RawAlbumTracksPage { items?: (RawTrack | null)[] | null; next?: string | null }
interface RawAlbumWithTracks extends RawAlbum { tracks?: RawAlbumTracksPage | null }

// Safety valve against a `next` loop; 50 tracks/page covers any real album many times over.
const MAX_ALBUM_TRACK_PAGES = 50

// Album-track items are "simplified" (no album field), so the album is stamped on each track.
export async function getSpotifyAlbumTracks(albumId: string): Promise<SpotifyAlbumTracks> {
  if (!isSpotifyConfigured()) throw new SpotifyNotConfiguredError()
  const raw = await spotifyGet<RawAlbumWithTracks>(`${API}/albums/${encodeURIComponent(albumId)}`, 'album')
  const album = {
    id: str(raw.id) || albumId,
    name: str(raw.name),
    imageUrl: pickImageUrl(raw.images),
    artists: mapArtistRefs(raw.artists),
  }
  const rawTracks: RawTrack[] = []
  let page: RawAlbumTracksPage | null | undefined = raw.tracks
  for (let n = 0; page && n < MAX_ALBUM_TRACK_PAGES; n++) {
    rawTracks.push(...items(page as RawPage<RawTrack>))
    const next: string | null | undefined = page.next
    if (!next) break
    // Only follow Spotify API URLs: the bearer token must not be sent anywhere else.
    if (!next.startsWith(`${API}/`)) throw new SpotifyApiError(502, 'Spotify returned an unexpected pagination URL')
    page = await spotifyGet<RawAlbumTracksPage>(next, 'album tracks')
  }
  const tracks = rawTracks.map((t) => mapTrack({ ...t, album: { id: album.id, name: album.name, images: raw.images } }))
  return { album, tracks }
}

// --- Artist albums (artist page "fill in the blanks", #72) ---

export interface SpotifyArtistAlbum extends SpotifyAlbum {
  releaseDate: string | null
}

// Spotify caps this endpoint at limit=10 for Development Mode apps (50 is a 400).
const ARTIST_ALBUMS_PAGE_SIZE = 10
export const MAX_ARTIST_ALBUM_PAGES = 10

// release_date comes as YYYY, YYYY-MM or YYYY-MM-DD depending on its precision.
export function releaseYearFrom(releaseDate: unknown): string | null {
  const year = typeof releaseDate === 'string' ? releaseDate.slice(0, 4) : ''
  return /^\d{4}$/.test(year) && year !== '0000' ? year : null
}

// The first artist result whose normalized name equals the query's, in Spotify's relevance order.
export async function findSpotifyArtistByName(name: string): Promise<{ id: string; name: string } | null> {
  if (!isSpotifyConfigured()) throw new SpotifyNotConfiguredError()
  const target = normalizeForMatch(name)
  if (!target) return null
  const qs = new URLSearchParams({ q: name, type: 'artist', limit: '10' })
  const data = await spotifyGet<RawSearchResponse>(`${API}/search?${qs}`, 'artist search')
  const match = items(data?.artists).find((a) => normalizeForMatch(a.name) === target)
  return match ? { id: str(match.id), name: str(match.name) } : null
}

interface RawArtistAlbumsPage { items?: (RawAlbum | null)[] | null; next?: string | null }

// Albums only (no singles/compilations/appears-on), all pages up to the cap, one per title.
export async function getSpotifyArtistAlbums(spotifyArtistId: string): Promise<SpotifyArtistAlbum[]> {
  if (!isSpotifyConfigured()) throw new SpotifyNotConfiguredError()
  const qs = new URLSearchParams({ include_groups: 'album', limit: String(ARTIST_ALBUMS_PAGE_SIZE) })
  let url: string | null = `${API}/artists/${encodeURIComponent(spotifyArtistId)}/albums?${qs}`
  const albums: SpotifyArtistAlbum[] = []
  for (let n = 0; url && n < MAX_ARTIST_ALBUM_PAGES; n++) {
    // Only follow Spotify API URLs: the bearer token must not be sent anywhere else.
    if (!url.startsWith(`${API}/`)) throw new SpotifyApiError(502, 'Spotify returned an unexpected pagination URL')
    const page: RawArtistAlbumsPage = await spotifyGet<RawArtistAlbumsPage>(url, 'artist albums')
    for (const raw of items(page as RawPage<RawAlbum>)) {
      const releaseDate = typeof raw.release_date === 'string' && raw.release_date ? raw.release_date : null
      albums.push({ ...mapAlbum(raw), releaseYear: releaseYearFrom(releaseDate), releaseDate })
    }
    url = page.next ?? null
  }
  return dedupeAlbumsByTitle(albums)
}

// Spotify lists some titles more than once (markets, reissues): keep the earliest
// release, then the one with more tracks. Order of first appearance is preserved.
export function dedupeAlbumsByTitle(albums: SpotifyArtistAlbum[]): SpotifyArtistAlbum[] {
  const byTitle = new Map<string, SpotifyArtistAlbum>()
  for (const album of albums) {
    const key = normalizeForMatch(album.name)
    const kept = byTitle.get(key)
    if (!kept) { byTitle.set(key, album); continue }
    const a = album.releaseDate ?? '9999'
    const b = kept.releaseDate ?? '9999'
    if (a < b || (a === b && (album.totalTracks ?? 0) > (kept.totalTracks ?? 0))) byTitle.set(key, album)
  }
  return [...byTitle.values()]
}

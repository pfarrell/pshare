// server/src/services/musicbrainz.ts

import { db } from '../db/database.js'
import { fetchAlbumArtFromCAA, hasCoverArt } from './coverArtArchive.js'
import { errorLogService } from './errorLogService.js'

import { imagesDir } from '../config/paths.js'

const IMAGES_DIR = imagesDir()

const MB_BASE = 'https://musicbrainz.org/ws/2'
const USER_AGENT = 'Bemused/1.0 (https://patf.net)'
const RATE_LIMIT_MS = 1100 // slightly over 1s to be safe

let nextAllowedTime = Date.now()

async function rateLimitedFetchRaw(url: string): Promise<Response> {
  const now = Date.now()
  const scheduledTime = Math.max(now, nextAllowedTime)
  nextAllowedTime = scheduledTime + RATE_LIMIT_MS
  const wait = scheduledTime - now
  if (wait > 0) await new Promise(r => setTimeout(r, wait))

  return fetch(url, {
    headers: {
      'User-Agent': USER_AGENT,
      'Accept': 'application/json',
    }
  })
}

async function rateLimitedFetch(url: string): Promise<any> {
  const res = await rateLimitedFetchRaw(url)
  if (!res.ok) throw new Error(`MusicBrainz API error: ${res.status} ${url}`)
  return res.json()
}

// ---- Album (release) lookup ----

export interface MBIDResult {
  mbid: string
  confidence: number
  status: 'auto_matched' | 'low_confidence' | 'not_found' | 'unmatched'
}

export async function lookupAlbumMBID(
  albumId: number,
  albumTitle: string,
  artistName: string,
  trackCount?: number,
  releaseYear?: string | null
): Promise<MBIDResult> {
  const query = encodeURIComponent(`artist:"${artistName}" AND release:"${albumTitle}"`)
  const url = `${MB_BASE}/release?query=${query}&limit=5&fmt=json`

  let data: any
  try {
    data = await rateLimitedFetch(url)
  } catch (err) {
    console.warn(`  ⚠️  MB lookup failed for album ${albumId}: ${(err as Error).message}`)
    errorLogService.record({ source: 'musicbrainz', message: (err as Error).message, context: `album ${albumId}` })
    return { mbid: '', confidence: 0, status: 'unmatched' }
  }

  const releases: any[] = data.releases ?? []
  if (releases.length === 0) {
    await updateAlbumMBID(albumId, null, 0, 'not_found')
    return { mbid: '', confidence: 0, status: 'not_found' }
  }

  // MB returns its own score 0-100 per candidate; use it as our base, with
  // the same track-count/year boosts as before.
  const scored = releases.map(r => {
    let score = parseInt(r.score ?? '0')
    if (trackCount && r['medium-list']?.[0]?.['track-count'] === trackCount) {
      score = Math.min(100, score + 5)
    }
    if (releaseYear && r.date?.startsWith(releaseYear)) {
      score = Math.min(100, score + 5)
    }
    return { release: r, score }
  })

  // Only candidates that clear the confidence bar are worth re-ranking by
  // cover art/country — this is a preference among otherwise-plausible
  // matches, not a way to promote a poor match.
  const candidates = scored.filter(s => s.score >= 50)

  if (candidates.length === 0) {
    const confidence = scored[0].score / 100
    await updateAlbumMBID(albumId, null, confidence, 'not_found')
    return { mbid: '', confidence, status: 'not_found' }
  }

  // Prefer releases with confirmed Cover Art Archive artwork, then US
  // releases, then fall back to score — matches how these get picked by
  // hand when browsing musicbrainz.org directly, and avoids the "no CAA
  // images for album" misses seen when a non-US or artless edition gets
  // auto-matched instead.
  const withCoverArt = await Promise.all(
    candidates.map(async c => ({ ...c, coverArt: await hasCoverArt(c.release.id) }))
  )

  withCoverArt.sort((a, b) => {
    if (a.coverArt !== b.coverArt) return a.coverArt ? -1 : 1
    const aIsUS = a.release.country === 'US'
    const bIsUS = b.release.country === 'US'
    if (aIsUS !== bIsUS) return aIsUS ? -1 : 1
    return b.score - a.score
  })

  const best = withCoverArt[0]
  const top = best.release
  const confidence = best.score / 100
  const status: MBIDResult['status'] = best.score >= 80 ? 'auto_matched' : 'low_confidence'

  await updateAlbumMBID(albumId, top.id, confidence, status, top['release-group']?.id ?? null)

  // Async image fetch from Cover Art Archive — non-blocking
  fetchAlbumArtFromCAA(albumId, top.id, IMAGES_DIR).catch(err => {
    console.warn(`  ⚠️  CAA image fetch failed post-MBID for album ${albumId}:`, err.message)
    errorLogService.record({ source: 'musicbrainz', message: err.message, context: `CAA fetch for album ${albumId}` })
  })

  return { mbid: top.id, confidence, status }
}

async function updateAlbumMBID(
  albumId: number,
  mbid: string | null,
  confidence: number,
  status: string,
  releaseGroupMbid: string | null = null
): Promise<void> {
  await db
    .updateTable('albums')
    .set({
      musicbrainz_id: mbid,
      mbid_confidence: confidence,
      mbid_status: status,
      release_group_musicbrainz_id: releaseGroupMbid,
    })
    .where('id', '=', albumId)
    .execute()
}

// ---- Artist lookup ----

export async function lookupArtistMBID(
  artistId: number,
  artistName: string
): Promise<MBIDResult> {
  const query = encodeURIComponent(`"${artistName}"`)
  const url = `${MB_BASE}/artist?query=${query}&limit=5&fmt=json`

  let data: any
  try {
    data = await rateLimitedFetch(url)
  } catch (err) {
    console.warn(`  ⚠️  MB lookup failed for artist ${artistId}: ${(err as Error).message}`)
    errorLogService.record({ source: 'musicbrainz', message: (err as Error).message, context: `artist ${artistId}` })
    return { mbid: '', confidence: 0, status: 'unmatched' }
  }

  const artists: any[] = data.artists ?? []
  if (artists.length === 0) {
    await updateArtistMBID(artistId, null, 0, 'not_found')
    return { mbid: '', confidence: 0, status: 'not_found' }
  }

  const top = artists[0]
  const score = parseInt(top.score ?? '0')
  const confidence = score / 100

  let status: MBIDResult['status']
  if (score >= 80) {
    status = 'auto_matched'
  } else if (score >= 50) {
    status = 'low_confidence'
  } else {
    await updateArtistMBID(artistId, null, confidence, 'not_found')
    return { mbid: '', confidence, status: 'not_found' }
  }

  await updateArtistMBID(artistId, top.id, confidence, status)
  return { mbid: top.id, confidence, status }
}

async function updateArtistMBID(
  artistId: number,
  mbid: string | null,
  confidence: number,
  status: string
): Promise<void> {
  await db
    .updateTable('artists')
    .set({ musicbrainz_id: mbid, mbid_confidence: confidence, mbid_status: status })
    .where('id', '=', artistId)
    .execute()
}

// ---- Manual ID entry (admin-supplied paste/search) ----

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const MB_URL_RE = /^https?:\/\/musicbrainz\.org\/(artist|release)\/([0-9a-fA-F-]{36})/

export function extractMbid(raw: string, expectedType: 'artist' | 'release'): string {
  if (UUID_RE.test(raw)) {
    return raw.toLowerCase()
  }

  const urlMatch = raw.match(MB_URL_RE)
  if (urlMatch) {
    const [, urlType, mbid] = urlMatch
    if (urlType !== expectedType) {
      const expectedLabel = expectedType === 'artist' ? 'an artist' : 'a release'
      throw new Error(`That's a MusicBrainz ${urlType} URL, not ${expectedLabel} URL`)
    }
    return mbid.toLowerCase()
  }

  throw new Error("Doesn't look like a MusicBrainz ID or URL")
}

export async function getArtistByMbid(
  mbid: string
): Promise<{ id: string; name: string; disambiguation?: string } | null> {
  const res = await rateLimitedFetchRaw(`${MB_BASE}/artist/${mbid}?fmt=json`)
  if (res.status === 404) return null
  if (!res.ok) throw new Error(`MusicBrainz API error: ${res.status}`)
  const data = await res.json()
  return { id: data.id, name: data.name, disambiguation: data.disambiguation || undefined }
}

export async function getReleaseByMbid(
  mbid: string
): Promise<{ id: string; title: string; artist_credit?: string; date?: string; original_date?: string; release_group_id?: string } | null> {
  const res = await rateLimitedFetchRaw(`${MB_BASE}/release/${mbid}?fmt=json&inc=artist-credits+release-groups`)
  if (res.status === 404) return null
  if (!res.ok) throw new Error(`MusicBrainz API error: ${res.status}`)
  const data = await res.json()
  const artistCredit = data['artist-credit']?.map((ac: any) => ac.name).join('') || undefined
  return {
    id: data.id,
    title: data.title,
    artist_credit: artistCredit,
    date: data.date || undefined,
    // The release-group's first-release-date is the original work's release
    // year (e.g. 1969 for a Beatles album), independent of which specific
    // edition/remaster/reissue this particular release mbid points at.
    original_date: data['release-group']?.['first-release-date'] || undefined,
    release_group_id: data['release-group']?.id || undefined,
  }
}

export interface MBArtistCandidate {
  id: string
  name: string
  disambiguation?: string
  type?: string
  country?: string
  life_span?: string
}

export async function searchArtistsMB(query: string): Promise<MBArtistCandidate[]> {
  const url = `${MB_BASE}/artist?query=${encodeURIComponent(query)}&limit=8&fmt=json`
  const data = await rateLimitedFetch(url)
  const artists: any[] = data.artists ?? []
  return artists.map(a => ({
    id: a.id,
    name: a.name,
    disambiguation: a.disambiguation || undefined,
    type: a.type || undefined,
    country: a.country || undefined,
    life_span: a['life-span']
      ? [a['life-span'].begin, a['life-span'].end].filter(Boolean).join(' – ') || undefined
      : undefined,
  }))
}

export interface MBReleaseCandidate {
  id: string
  title: string
  artist_credit?: string
  date?: string
  country?: string
  track_count?: number
  disambiguation?: string
}

export async function searchReleasesMB(query: string): Promise<MBReleaseCandidate[]> {
  const url = `${MB_BASE}/release?query=${encodeURIComponent(query)}&limit=8&fmt=json`
  const data = await rateLimitedFetch(url)
  const releases: any[] = data.releases ?? []
  return releases.map(r => ({
    id: r.id,
    title: r.title,
    artist_credit: r['artist-credit']?.map((ac: any) => ac.name).join('') || undefined,
    date: r.date || undefined,
    country: r.country || undefined,
    track_count: r['medium-list']?.[0]?.['track-count'] || undefined,
    disambiguation: r.disambiguation || undefined,
  }))
}

export interface MBRecordingCandidate {
  id: string
  title: string
  artistCredit?: string
  releaseTitle?: string
  length?: number
  disambiguation?: string
}

export async function searchRecordingsMB(query: string, artistName?: string): Promise<MBRecordingCandidate[]> {
  const q = artistName ? `recording:"${query}" AND artist:"${artistName}"` : query
  const url = `${MB_BASE}/recording?query=${encodeURIComponent(q)}&limit=8&fmt=json`
  const data = await rateLimitedFetch(url)
  const recordings: any[] = data.recordings ?? []
  return recordings.map(r => ({
    id: r.id,
    title: r.title,
    artistCredit: r['artist-credit']?.map((ac: any) => ac.name).join('') || undefined,
    releaseTitle: r.releases?.[0]?.title || undefined,
    length: r.length || undefined,
    disambiguation: r.disambiguation || undefined,
  }))
}

// ---- Release tracklist (for upload-time recording MBID resolution) ----

export interface MBReleaseTrack {
  discNumber: number
  position: number
  recordingId: string
  recordingTitle: string
}

export async function getReleaseRecordings(releaseMbid: string): Promise<MBReleaseTrack[]> {
  const data = await rateLimitedFetch(`${MB_BASE}/release/${releaseMbid}?fmt=json&inc=recordings`)
  const media: any[] = data.media ?? []
  const tracks: MBReleaseTrack[] = []

  media.forEach((medium: any, mediumIndex: number) => {
    const discNumber = medium.position ?? mediumIndex + 1
    for (const t of medium.tracks ?? []) {
      if (t.recording?.id && typeof t.position === 'number') {
        tracks.push({
          discNumber,
          position: t.position,
          recordingId: t.recording.id,
          recordingTitle: t.recording.title ?? t.title ?? '',
        })
      }
    }
  })

  return tracks
}

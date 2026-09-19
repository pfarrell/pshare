// server/src/services/mbidService.ts
import { extractMbid } from './musicbrainz.js'
import { getArtistByMbid, getReleaseByMbid } from './musicbrainzLocal.js'

type MbidKind = 'artist' | 'release'
type Lookup = (mbid: string) => Promise<Record<string, any> | null>

export type ManualMbidUpdate = { musicbrainz_id: string | null; mbid_confidence: number | null; mbid_status: string }

export type ManualMbidResult =
  | { ok: true; update: null; sameAsCurrent: boolean }
  | { ok: true; update: ManualMbidUpdate; entity: Record<string, any> | null; sameAsCurrent: boolean }
  | { ok: false; status: 400 | 502; error: string }

const DEFAULT_LOOKUP: Record<MbidKind, Lookup> = { artist: getArtistByMbid, release: getReleaseByMbid }

// Validates an admin-entered MusicBrainz id/URL for an artist or release.
export async function resolveManualMbid(
  kind: MbidKind,
  raw: unknown,
  currentMbid: string | null,
  lookup: Lookup = DEFAULT_LOOKUP[kind]
): Promise<ManualMbidResult> {
  if (raw === undefined) return { ok: true, update: null, sameAsCurrent: false }

  const trimmed = typeof raw === 'string' ? raw.trim() : ''
  if (!trimmed) {
    return currentMbid
      ? { ok: true, update: { musicbrainz_id: null, mbid_confidence: null, mbid_status: 'unmatched' }, entity: null, sameAsCurrent: false }
      : { ok: true, update: null, sameAsCurrent: false }
  }

  let mbid: string
  try {
    mbid = extractMbid(trimmed, kind)
  } catch (err) {
    return { ok: false, status: 400, error: (err as Error).message }
  }

  if (mbid === currentMbid) return { ok: true, update: null, sameAsCurrent: true }

  let entity
  try {
    entity = await lookup(mbid)
  } catch {
    return { ok: false, status: 502, error: 'Could not reach MusicBrainz to verify — try again' }
  }
  if (!entity) return { ok: false, status: 400, error: `No such ${kind} found on MusicBrainz` }

  return { ok: true, update: { musicbrainz_id: mbid, mbid_confidence: 1.0, mbid_status: 'manual' }, entity, sameAsCurrent: false }
}

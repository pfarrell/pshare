import { normalizeTitle } from '../utils/titleMatch.js'

export type DupTrack = {
  id: number
  album_id: number | null
  title: string | null
  media_file_id: number | null
  duration_sec?: number | null
  file_hash?: string | null              // md5 of the file bytes (media_files.file_hash)
  chromaprint_key?: string | null        // md5 of the chromaprint fingerprint; equal => identical fingerprint
  musicbrainz_recording_id?: string | null
}

// Why tracks in a group were linked. Ordered strongest first.
export type DupReason = 'file' | 'md5' | 'chromaprint' | 'musicbrainz' | 'title'
const REASON_RANK: Record<DupReason, number> = { file: 0, md5: 0, chromaprint: 0, musicbrainz: 1, title: 2 }

export type DupGroup<T extends DupTrack> = { reasons: DupReason[]; album_id: number; tracks: T[] }

export const pairKey = (a: number, b: number): string => (a < b ? `${a}-${b}` : `${b}-${a}`)

const MIN_SUBSTRING_LEN = 5
const MIN_SUBSTRING_COVERAGE = 0.7
// Same recording re-encoded or re-tagged lands within a second or two; a title or
// MusicBrainz match between tracks far apart in length is a different song.
const MAX_DURATION_DELTA_SEC = 5
// Scanners and taggers leave these behind; a shared placeholder says nothing.
const PLACEHOLDER_TITLE = /^(track|untitled|unknown|audio track)( \d+)?$/
// Mis-tagged files carry the ripper's e-mail address as the title; thousands of unrelated songs share it.
const JUNK_TITLE = /@/

// Stricter than titlesRoughlyMatch (which exists to resolve MusicBrainz ids and
// accepts any substring): there, "Me" matching "Me and Bobby McGee" is harmless,
// but here it links unrelated tracks and snowballs a compilation into one huge
// group. Takes already-normalized titles. Equal always matches; otherwise one
// must appear in the other as whole words and be most of it ("Track 2" must not
// match "Track 20", nor "Variation V" "Variation VI").
export function normalizedTitlesMatch(a: string, b: string): boolean {
  if (!a || !b) return false
  if (a === b) return true
  const [short, long] = a.length <= b.length ? [a, b] : [b, a]
  return short.length >= MIN_SUBSTRING_LEN
    && short.length / long.length >= MIN_SUBSTRING_COVERAGE
    && ` ${long} `.includes(` ${short} `)
}

// Fingerprint/recording-id matches claim "same recording", so lengths must agree tightly.
const MAX_ID_DURATION_DELTA_SEC = 3
const MAX_ID_BUCKET = 4

const durationsClose = (a?: number | null, b?: number | null, maxDelta = MAX_DURATION_DELTA_SEC): boolean =>
  a == null || b == null || Math.abs(a - b) <= maxDelta

// Clusters tracks within an album into duplicate groups. Tracks are linked by:
//   - same media file row or same md5: the bytes are the
//     same, so these link and chain freely;
//   - identical chromaprint, same MusicBrainz recording id: also strong but known to
//     collide (see below), so small buckets only, with tight durations, no chaining;
//     (AcoustID false positives are known to put unrelated songs under one id:
//     see scripts/audit-recording-mbid-collisions.sql);
//   - matching title with a compatible duration: fuzzy, does not chain.
// Dismissed pairs are never linked. A group is a connected set of linked tracks.
// Largest groups first, then those with the strongest evidence.
export function groupDuplicateTracks<T extends DupTrack>(tracks: T[], dismissed: Set<string>): DupGroup<T>[] {
  const byAlbum = new Map<number, T[]>()
  for (const t of tracks) {
    if (t.album_id == null) continue
    const list = byAlbum.get(t.album_id) ?? []
    list.push(t)
    byAlbum.set(t.album_id, list)
  }

  const groups: DupGroup<T>[] = []
  for (const [albumId, rawTracks] of byAlbum) {
    if (rawTracks.length < 2) continue
    const albumTracks = [...rawTracks].sort((x, y) => x.id - y.id)
    const parent = new Map<number, number>(albumTracks.map((t) => [t.id, t.id]))
    const reasonsByTrack = new Map<number, Set<DupReason>>()
    const find = (x: number): number => {
      while (parent.get(x) !== x) {
        parent.set(x, parent.get(parent.get(x)!)!)
        x = parent.get(x)!
      }
      return x
    }
    const link = (a: T, b: T, reason: DupReason) => {
      parent.set(find(a.id), find(b.id))
      for (const id of [a.id, b.id]) {
        const set = reasonsByTrack.get(id) ?? new Set<DupReason>()
        set.add(reason)
        reasonsByTrack.set(id, set)
      }
    }
    const isDismissed = (a: T, b: T) => dismissed.has(pairKey(a.id, b.id))

    // Byte-identical files: chains transitively.
    const exact: [DupReason, (t: T) => string | number | null | undefined][] = [
      ['file', (t) => t.media_file_id],
      ['md5', (t) => t.file_hash],
    ]
    for (const [reason, keyOf] of exact) {
      const firstByKey = new Map<string | number, T>()
      for (const t of albumTracks) {
        const key = keyOf(t)
        if (key == null || key === '') continue
        const first = firstByKey.get(key)
        if (!first) firstByKey.set(key, t)
        // md5 of a shared media file row is the same file; report it as 'file' only
        else if (!isDismissed(first, t) && !(reason === 'md5' && first.media_file_id != null && first.media_file_id === t.media_file_id)) link(first, t, reason)
      }
    }

    // Fingerprint and recording-id links are strong but not infallible, and prod
    // data shows how they fail: one id shared by 88 sections of a single spoken
    // recording, one fingerprint shared by 11 different songs. A real duplicate
    // of one recording on one album comes in twos or threes, so an oversized
    // bucket is treated as a collision and ignored, and members must also agree
    // on length. A track joins a cluster only if it matches that cluster's first
    // track, so A~B and B~C never merge A and C.
    const idLinks: [DupReason, (t: T) => string | null | undefined][] = [
      ['chromaprint', (t) => t.chromaprint_key],
      ['musicbrainz', (t) => t.musicbrainz_recording_id],
    ]
    for (const [reason, keyOf] of idLinks) {
      const buckets = new Map<string, T[]>()
      for (const t of albumTracks) {
        const key = keyOf(t)
        if (!key) continue
        const list = buckets.get(key) ?? []
        list.push(t)
        buckets.set(key, list)
      }
      for (const bucket of buckets.values()) {
        if (bucket.length < 2 || bucket.length > MAX_ID_BUCKET) continue
        const reps: T[] = []
        for (const t of bucket) {
          const rep = reps.find((r) => durationsClose(r.duration_sec, t.duration_sec, MAX_ID_DURATION_DELTA_SEC) && !isDismissed(r, t))
          if (rep) link(rep, t, reason)
          else reps.push(t)
        }
      }
    }

    // Fuzzy title links.
    type Cluster = { rep: T; norm: string }
    const titleClusters: Cluster[] = []
    for (const t of albumTracks) {
      if (t.title) {
        const norm = normalizeTitle(t.title)
        if (norm && !PLACEHOLDER_TITLE.test(norm) && !JUNK_TITLE.test(t.title)) {
          const cluster = titleClusters.find((c) =>
            normalizedTitlesMatch(c.norm, norm) && durationsClose(c.rep.duration_sec, t.duration_sec) && !isDismissed(c.rep, t))
          if (cluster) link(cluster.rep, t, 'title')
          else titleClusters.push({ rep: t, norm })
        }
      }
    }

    const components = new Map<number, T[]>()
    for (const t of albumTracks) {
      const root = find(t.id)
      const list = components.get(root) ?? []
      list.push(t)
      components.set(root, list)
    }
    for (const members of components.values()) {
      if (members.length < 2) continue
      // Resolving a group points every track at one definitive media file and keeps
      // the tracks, so a group already sharing a single file is done, not pending.
      const fileIds = new Set(members.map((m) => m.media_file_id))
      if (fileIds.size === 1 && !fileIds.has(null)) continue
      const reasons = new Set<DupReason>()
      for (const m of members) for (const r of reasonsByTrack.get(m.id) ?? []) reasons.add(r)
      groups.push({ reasons: [...reasons].sort((a, b) => REASON_RANK[a] - REASON_RANK[b]), album_id: albumId, tracks: members })
    }
  }

  const strongest = (g: DupGroup<T>) => Math.min(...g.reasons.map((r) => REASON_RANK[r]))
  groups.sort((x, y) => y.tracks.length - x.tracks.length || strongest(x) - strongest(y) || x.album_id - y.album_id)
  return groups
}

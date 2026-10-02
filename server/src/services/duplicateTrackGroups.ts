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

export type DupGroup<T extends DupTrack> = { reasons: DupReason[]; album_ids: number[]; tracks: T[] }

export const pairKey = (a: number, b: number): string => (a < b ? `${a}-${b}` : `${b}-${a}`)

const MIN_SUBSTRING_LEN = 5
const MIN_SUBSTRING_COVERAGE = 0.7
// Same recording re-encoded or re-tagged lands within a second or two; a title match
// between tracks far apart in length is a different song with a shared name.
const MAX_DURATION_DELTA_SEC = 5
// Fingerprint/recording-id matches claim "same recording", so lengths must agree tightly.
const MAX_ID_DURATION_DELTA_SEC = 3
// Real duplicates of one recording on ONE album come in twos or threes; a bigger bucket
// of identical ids/fingerprints on one album is a collision (88 sections of one spoken
// recording, 11 different songs under one fingerprint).
const MAX_SAME_ALBUM_ID_BUCKET = 4
// Across albums, the same recording legitimately appears on many releases, so MusicBrainz
// buckets are allowed to be large (they also have to agree on title, see below). A
// fingerprint match carries no title check, so its bucket stays small: the one big
// fingerprint bucket in prod is 20 unrelated tracks spanning 1492s.
const MAX_CROSS_ALBUM_MUSICBRAINZ_BUCKET = 40
const MAX_CROSS_ALBUM_CHROMAPRINT_BUCKET = 6
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

const durationsClose = (a?: number | null, b?: number | null, maxDelta = MAX_DURATION_DELTA_SEC): boolean =>
  a == null || b == null || Math.abs(a - b) <= maxDelta

// Usable normalized title for matching, or null for missing/placeholder/junk titles.
function matchableTitle(title: string | null): string | null {
  if (!title || JUNK_TITLE.test(title)) return null
  const norm = normalizeTitle(title)
  return norm && !PLACEHOLDER_TITLE.test(norm) ? norm : null
}

// Clusters tracks into duplicate groups. Tracks are linked by:
//   - same media file row or same md5 (anywhere in the library): the bytes are the same,
//     so these link and chain freely;
//   - identical chromaprint, and same MusicBrainz recording id: strong but known to collide
//     (see scripts/audit-recording-mbid-collisions.sql), so with tight durations, bucket
//     caps and no chaining. On one album an id alone is enough; across albums a
//     MusicBrainz match must also agree on title, since polluted ids pair unrelated songs;
//   - matching title with a compatible duration: fuzzy, only within one album, no chaining.
// Dismissed pairs are never linked. A group is a connected set of linked tracks. Groups
// whose tracks all share one media file are finished and omitted. Largest groups first,
// then those with the strongest evidence.
export function groupDuplicateTracks<T extends DupTrack>(tracks: T[], dismissed: Set<string>): DupGroup<T>[] {
  const all = tracks.filter((t) => t.album_id != null).sort((x, y) => x.id - y.id)
  const parent = new Map<number, number>(all.map((t) => [t.id, t.id]))
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
  const bucketBy = (keyOf: (t: T) => string | number | null | undefined): T[][] => {
    const buckets = new Map<string | number, T[]>()
    for (const t of all) {
      const key = keyOf(t)
      if (key == null || key === '') continue
      const list = buckets.get(key) ?? []
      list.push(t)
      buckets.set(key, list)
    }
    return [...buckets.values()].filter((b) => b.length > 1)
  }

  // Byte-identical files: chain transitively.
  for (const [reason, keyOf] of [['file', (t: T) => t.media_file_id], ['md5', (t: T) => t.file_hash]] as const) {
    for (const bucket of bucketBy(keyOf)) {
      const first = bucket[0]
      for (const t of bucket.slice(1)) {
        // an md5 shared by tracks on one media file row is the same file; report it as 'file' only
        if (reason === 'md5' && first.media_file_id != null && first.media_file_id === t.media_file_id) continue
        if (!isDismissed(first, t)) link(first, t, reason)
      }
    }
  }

  // Fingerprint / recording-id links. A track joins a cluster only if it matches that
  // cluster's first track, so A~B and B~C never merge A and C.
  const idLinks: [DupReason, (t: T) => string | null | undefined, number][] = [
    ['chromaprint', (t) => t.chromaprint_key, MAX_CROSS_ALBUM_CHROMAPRINT_BUCKET],
    ['musicbrainz', (t) => t.musicbrainz_recording_id, MAX_CROSS_ALBUM_MUSICBRAINZ_BUCKET],
  ]
  for (const [reason, keyOf, maxCrossBucket] of idLinks) {
    for (const bucket of bucketBy(keyOf)) {
      // same album: any agreeing id is evidence, as long as the bucket is small
      const perAlbum = new Map<number, T[]>()
      for (const t of bucket) perAlbum.set(t.album_id!, [...(perAlbum.get(t.album_id!) ?? []), t])
      for (const members of perAlbum.values()) {
        if (members.length < 2 || members.length > MAX_SAME_ALBUM_ID_BUCKET) continue
        const reps: T[] = []
        for (const t of members) {
          const rep = reps.find((r) => durationsClose(r.duration_sec, t.duration_sec, MAX_ID_DURATION_DELTA_SEC) && !isDismissed(r, t))
          if (rep) link(rep, t, reason)
          else reps.push(t)
        }
      }

      // across albums
      if (perAlbum.size < 2 || bucket.length > maxCrossBucket) continue
      const reps: { t: T; norm: string | null }[] = []
      for (const t of bucket) {
        const norm = matchableTitle(t.title)
        const rep = reps.find((r) =>
          r.t.album_id !== t.album_id
          && durationsClose(r.t.duration_sec, t.duration_sec, MAX_ID_DURATION_DELTA_SEC)
          && !isDismissed(r.t, t)
          && (reason !== 'musicbrainz' || (r.norm != null && norm != null && normalizedTitlesMatch(r.norm, norm))))
        if (rep) link(rep.t, t, reason)
        else reps.push({ t, norm })
      }
    }
  }

  // Fuzzy title links: only within one album, where a shared title is meaningful.
  const byAlbum = new Map<number, T[]>()
  for (const t of all) byAlbum.set(t.album_id!, [...(byAlbum.get(t.album_id!) ?? []), t])
  for (const albumTracks of byAlbum.values()) {
    if (albumTracks.length < 2) continue
    const clusters: { rep: T; norm: string }[] = []
    for (const t of albumTracks) {
      const norm = matchableTitle(t.title)
      if (!norm) continue
      const cluster = clusters.find((c) =>
        normalizedTitlesMatch(c.norm, norm) && durationsClose(c.rep.duration_sec, t.duration_sec) && !isDismissed(c.rep, t))
      if (cluster) link(cluster.rep, t, 'title')
      else clusters.push({ rep: t, norm })
    }
  }

  const components = new Map<number, T[]>()
  for (const t of all) {
    const root = find(t.id)
    const list = components.get(root) ?? []
    list.push(t)
    components.set(root, list)
  }
  const groups: DupGroup<T>[] = []
  for (const allMembers of components.values()) {
    // Tracks pointing at the same media file are already consolidated: they are one
    // recording, not duplicates of each other. Keep one per file (lowest id) so only
    // genuinely different files are left to compare. A group left with fewer than two
    // is finished.
    const seenFiles = new Set<number>()
    const members = allMembers.filter((m) => {
      if (m.media_file_id == null) return true
      if (seenFiles.has(m.media_file_id)) return false
      seenFiles.add(m.media_file_id)
      return true
    })
    if (members.length < 2) continue
    const reasons = new Set<DupReason>()
    for (const m of members) for (const r of reasonsByTrack.get(m.id) ?? []) reasons.add(r)
    groups.push({
      reasons: [...reasons].sort((a, b) => REASON_RANK[a] - REASON_RANK[b]),
      album_ids: [...new Set(members.map((m) => m.album_id!))].sort((a, b) => a - b),
      tracks: members,
    })
  }

  const strongest = (g: DupGroup<T>) => Math.min(...g.reasons.map((r) => REASON_RANK[r]))
  groups.sort((x, y) => y.tracks.length - x.tracks.length || strongest(x) - strongest(y) || x.album_ids[0] - y.album_ids[0])
  return groups
}

import { titlesRoughlyMatch } from '../utils/titleMatch.js'

export type DupTrack = { id: number; album_id: number | null; title: string | null; media_file_id: number | null }
export type DupGroup<T extends DupTrack> = { tier: 1 | 2; album_id: number; tracks: T[] }

export const pairKey = (a: number, b: number): string => (a < b ? `${a}-${b}` : `${b}-${a}`)

// Clusters tracks within an album into duplicate groups. Two tracks are linked
// when they share a media file (tier 1) or their titles roughly match (tier 2),
// unless that pair was dismissed; a group is a connected set of linked tracks.
// A group is tier 1 only if every member shares one audio file. Largest groups
// first so the biggest cleanups surface at the top.
export function groupDuplicateTracks<T extends DupTrack>(tracks: T[], dismissed: Set<string>): DupGroup<T>[] {
  const byAlbum = new Map<number, T[]>()
  for (const t of tracks) {
    if (t.album_id == null) continue
    const list = byAlbum.get(t.album_id) ?? []
    list.push(t)
    byAlbum.set(t.album_id, list)
  }

  const groups: DupGroup<T>[] = []
  for (const [albumId, albumTracks] of byAlbum) {
    const parent = new Map<number, number>(albumTracks.map((t) => [t.id, t.id]))
    const find = (x: number): number => {
      while (parent.get(x) !== x) {
        parent.set(x, parent.get(parent.get(x)!)!)
        x = parent.get(x)!
      }
      return x
    }
    for (let i = 0; i < albumTracks.length; i++) {
      for (let j = i + 1; j < albumTracks.length; j++) {
        const a = albumTracks[i], b = albumTracks[j]
        if (dismissed.has(pairKey(a.id, b.id))) continue
        // titles are nullable in the real schema; titlesRoughlyMatch has no null check
        const sameFile = a.media_file_id != null && a.media_file_id === b.media_file_id
        const sameTitle = !!a.title && !!b.title && titlesRoughlyMatch(a.title, b.title)
        if (sameFile || sameTitle) parent.set(find(a.id), find(b.id))
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
      members.sort((x, y) => x.id - y.id)
      const files = new Set(members.map((m) => m.media_file_id))
      const tier = files.size === 1 && !files.has(null) ? 1 : 2
      groups.push({ tier, album_id: albumId, tracks: members })
    }
  }

  groups.sort((x, y) => y.tracks.length - x.tracks.length || x.tier - y.tier || x.album_id - y.album_id)
  return groups
}

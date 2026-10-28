// server/src/services/spotifyAlbumFill.ts
// Experimental (#72). Decides whether a Spotify release confidently matches an
// incomplete library album, and if so which of its tracks fill the gaps. Pure:
// the caller (GET /spotify/library-albums/:id/fill) fetches the candidates.
// A wrong fill (another edition's songs between the user's own tracks) is worse
// than none, so every rule here errs towards returning null.
import { normalizeForMatch } from './spotifyLibraryMatch.js'
import type { SpotifyAlbum, SpotifyTrack } from './spotify.js'

export interface LibraryAlbumForFill {
  title: string
  artistName: string
  releaseYear: string | null
  discNumber: number | null
  tracks: { id: number; title: string; trackNumber: string | null }[]
}

export interface FillCandidate { album: SpotifyAlbum; tracks: SpotifyTrack[] }

export interface AlbumFill {
  spotifyAlbum: { id: string; name: string; imageUrl: string | null }
  tracks: (SpotifyTrack & { position: number })[]
  // Every library track's position on the matched release (unnumbered ones
  // included), so the client can interleave the two lists.
  libraryPositions: Record<number, number>
}

// A title without its " - Remastered"-style tail or (…)/[…] parts, normalized.
export function titleKey(title: string): string {
  if (typeof title !== 'string') return ''
  return normalizeForMatch(title.replace(/\s+-\s+.*$/, '').replace(/\([^)]*\)|\[[^\]]*\]/g, ' '))
}

// Equal keys, or one is the other plus more words: library titles are often a
// shortened form ("the bomber" for "The Bomber A: Closet Queen B: … - Medley").
export function titlesAgree(a: string, b: string): boolean {
  const x = titleKey(a)
  const y = titleKey(b)
  if (!x || !y) return false
  return x === y || y.startsWith(`${x} `) || x.startsWith(`${y} `)
}

// Words that mark a different recording of the same songs. titleKey drops
// " - Live" / "(Live)", so an edition carrying one must be asked for by name.
const VERSION_WORDS = new Set(['live', 'acoustic', 'demo', 'demos', 'instrumental', 'instrumentals', 'karaoke', 'unplugged', 'remix', 'remixes'])
const versionWords = (name: string) => normalizeForMatch(name).split(' ').filter((w) => VERSION_WORDS.has(w))

// A search result worth opening: same title by the same artist. Reissue tails
// ("(Remastered)") are ignored; live/acoustic/demo-style editions only match a
// library title that names the same version.
export function candidateMatchesAlbum(library: LibraryAlbumForFill, album: SpotifyAlbum): boolean {
  const title = titleKey(library.title)
  const artist = normalizeForMatch(library.artistName)
  const wanted = new Set(versionWords(library.title))
  return !!title && !!artist && titleKey(album.name) === title
    && versionWords(album.name).every((w) => wanted.has(w))
    && album.artists.some((a) => normalizeForMatch(a.name) === artist)
}

// Items released in the library album's year, when there are any; otherwise
// all of them. The library stores years as text, sometimes as a full date.
export function narrowByYear<T>(releaseYear: string | null, items: T[], yearOf: (item: T) => string | null): T[] {
  const year = typeof releaseYear === 'string' ? releaseYear.slice(0, 4) : ''
  if (!/^\d{4}$/.test(year)) return items
  const same = items.filter((item) => yearOf(item) === year)
  return same.length > 0 ? same : items
}

const positionOf = (trackNumber: string | null): number | null => {
  const n = parseInt(trackNumber ?? '', 10)
  return Number.isInteger(n) && n > 0 ? n : null
}

// The candidate's tracks on one disc, keyed by track number.
function discTracks(candidate: FillCandidate, disc: number): Map<number, SpotifyTrack> {
  const byPosition = new Map<number, SpotifyTrack>()
  for (const t of candidate.tracks) {
    if ((t.discNumber ?? 1) === disc && t.trackNumber !== null) byPosition.set(t.trackNumber, t)
  }
  return byPosition
}

// Every library track's position on this disc, or null when any doesn't fit.
function placeLibraryTracks(library: LibraryAlbumForFill, onDisc: Map<number, SpotifyTrack>): Record<number, number> | null {
  const positions: Record<number, number> = {}
  for (const t of library.tracks) {
    const position = positionOf(t.trackNumber)
    if (position !== null) {
      const spotify = onDisc.get(position)
      if (!spotify || !titlesAgree(t.title, spotify.name)) return null
      positions[t.id] = position
    } else {
      // Without a position to confirm it, a prefix ("Live" for "Live Forever") is too weak.
      const key = titleKey(t.title)
      const agreeing = key ? [...onDisc.entries()].filter(([, s]) => titleKey(s.name) === key) : []
      if (agreeing.length !== 1) return null
      positions[t.id] = agreeing[0][0]
    }
  }
  return positions
}

// Full names, suffixes included: a live and a studio edition of the same
// songs must count as different track lists.
const sameTrackList = (a: Map<number, SpotifyTrack>, b: Map<number, SpotifyTrack>) =>
  a.size === b.size && [...a.entries()].every(([position, t]) => {
    const other = b.get(position)
    return !!other && normalizeForMatch(t.name) === normalizeForMatch(other.name)
  })

export function matchAlbumFill(library: LibraryAlbumForFill, candidates: FillCandidate[]): AlbumFill | null {
  if (library.tracks.length === 0 || candidates.length === 0) return null
  const pool = narrowByYear(library.releaseYear, candidates, (c) => c.album.releaseYear)
  const disc = library.discNumber ?? 1

  const passing = pool
    .map((candidate) => {
      const onDisc = discTracks(candidate, disc)
      return { candidate, onDisc, positions: placeLibraryTracks(library, onDisc) }
    })
    .filter((p): p is typeof p & { positions: Record<number, number> } => p.positions !== null)
  if (passing.length === 0) return null
  const [first] = passing
  if (!passing.every((p) => sameTrackList(first.onDisc, p.onDisc))) return null

  const occupied = new Set(Object.values(first.positions))
  const tracks = [...first.onDisc.entries()]
    .filter(([position]) => !occupied.has(position))
    .sort(([a], [b]) => a - b)
    .map(([position, t]) => ({ ...t, position }))
  if (tracks.length === 0) return null

  const { id, name, imageUrl } = first.candidate.album
  return { spotifyAlbum: { id, name, imageUrl }, tracks, libraryPositions: first.positions }
}

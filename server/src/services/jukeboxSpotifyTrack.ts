// server/src/services/jukeboxSpotifyTrack.ts
// The Spotify track a phone guest submits to a kiosk (#72, experimental):
// the /search/spotify track shape, trimmed to what the kiosk needs to build a
// queue entry (src/utils/trackSource.js toSpotifyQueueTrack). Stored as JSON
// on jukebox_queue_submissions.spotify_track and rendered on the kiosk, so
// everything is type-checked and length-capped here.
import { SPOTIFY_TRACK_URI } from './jukeboxStateService.js'

const SPOTIFY_ID = /^[A-Za-z0-9]{1,64}$/
const MAX_TEXT = 300
const MAX_ARTISTS = 10

export interface GuestSpotifyTrack {
  uri: string
  id: string
  name: string
  artists: { name: string }[]
  album: { id: string | null; name: string; imageUrl: string | null }
  durationMs: number
}

const text = (v: unknown) => (typeof v === 'string' ? v.slice(0, MAX_TEXT) : '')

// null when it isn't a Spotify track; optional fields degrade instead.
export function parseGuestSpotifyTrack(raw: unknown): GuestSpotifyTrack | null {
  if (!raw || typeof raw !== 'object') return null
  const t = raw as Record<string, any>
  if (typeof t.uri !== 'string' || !SPOTIFY_TRACK_URI.test(t.uri)) return null
  const album = t.album && typeof t.album === 'object' ? t.album : {}
  const image = typeof album.imageUrl === 'string' && album.imageUrl.startsWith('https://') && album.imageUrl.length <= MAX_TEXT
    ? album.imageUrl
    : null
  const durationMs = Number(t.durationMs)
  return {
    uri: t.uri,
    id: typeof t.id === 'string' && SPOTIFY_ID.test(t.id) ? t.id : t.uri.slice('spotify:track:'.length),
    name: text(t.name),
    artists: (Array.isArray(t.artists) ? t.artists : [])
      .filter((a: unknown) => a && typeof a === 'object' && typeof (a as any).name === 'string')
      .slice(0, MAX_ARTISTS)
      .map((a: any) => ({ name: text(a.name) })),
    album: {
      id: typeof album.id === 'string' && SPOTIFY_ID.test(album.id) ? album.id : null,
      name: text(album.name),
      imageUrl: image,
    },
    durationMs: Number.isFinite(durationMs) && durationMs > 0 ? Math.round(durationMs) : 0,
  }
}

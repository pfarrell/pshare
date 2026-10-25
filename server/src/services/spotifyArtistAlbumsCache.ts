// server/src/services/spotifyArtistAlbumsCache.ts
// In-memory cache of an artist's Spotify albums (artist page, #72), keyed by
// local artist id or, for the in-app Spotify artist view, Spotify artist id:
// Development Mode quotas are per developer account, so repeat visits must not
// re-page the catalogue. Lost on restart, which is fine.
import type { SpotifyArtistAlbum } from './spotify.js'

export interface CachedArtistAlbums {
  spotifyArtist: { id: string; name: string; imageUrl?: string | null; externalUrl?: string | null } | null
  albums: SpotifyArtistAlbum[]
}

// Local artist ids are numbers, Spotify ids are strings, so the two never collide.
type CacheKey = number | string

export function createSpotifyArtistAlbumsCache({ ttlMs, maxEntries, now = Date.now }: {
  ttlMs: number
  maxEntries: number
  now?: () => number
}) {
  // Map iteration order is insertion order, so re-inserting on read makes the first key the LRU one.
  const entries = new Map<CacheKey, { value: CachedArtistAlbums; expiresAt: number }>()
  return {
    get(key: CacheKey): CachedArtistAlbums | undefined {
      const hit = entries.get(key)
      if (!hit) return undefined
      entries.delete(key)
      if (now() >= hit.expiresAt) return undefined
      entries.set(key, hit)
      return hit.value
    },
    set(key: CacheKey, value: CachedArtistAlbums): void {
      entries.delete(key)
      entries.set(key, { value, expiresAt: now() + ttlMs })
      while (entries.size > maxEntries) entries.delete(entries.keys().next().value as CacheKey)
    },
  }
}

export const SPOTIFY_ARTIST_ALBUMS_TTL_MS = 6 * 60 * 60 * 1000
export const SPOTIFY_ARTIST_ALBUMS_MAX_ENTRIES = 500

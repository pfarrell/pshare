// server/src/services/spotifyArtistAlbumsCache.ts
// In-memory cache of each local artist's Spotify albums (artist page, #72):
// Development Mode quotas are per developer account, so repeat visits must not
// re-page the catalogue. Lost on restart, which is fine.
import type { SpotifyArtistAlbum } from './spotify.js'

export interface CachedArtistAlbums {
  spotifyArtist: { id: string; name: string } | null
  albums: SpotifyArtistAlbum[]
}

export function createSpotifyArtistAlbumsCache({ ttlMs, maxEntries, now = Date.now }: {
  ttlMs: number
  maxEntries: number
  now?: () => number
}) {
  // Map iteration order is insertion order, so re-inserting on read makes the first key the LRU one.
  const entries = new Map<number, { value: CachedArtistAlbums; expiresAt: number }>()
  return {
    get(key: number): CachedArtistAlbums | undefined {
      const hit = entries.get(key)
      if (!hit) return undefined
      entries.delete(key)
      if (now() >= hit.expiresAt) return undefined
      entries.set(key, hit)
      return hit.value
    },
    set(key: number, value: CachedArtistAlbums): void {
      entries.delete(key)
      entries.set(key, { value, expiresAt: now() + ttlMs })
      while (entries.size > maxEntries) entries.delete(entries.keys().next().value as number)
    },
  }
}

export const SPOTIFY_ARTIST_ALBUMS_TTL_MS = 6 * 60 * 60 * 1000
export const SPOTIFY_ARTIST_ALBUMS_MAX_ENTRIES = 500

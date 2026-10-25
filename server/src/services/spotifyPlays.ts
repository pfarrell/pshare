// server/src/services/spotifyPlays.ts
// Spotify play log (#72, experimental): one spotify_plays row per Spotify track
// played past the 5-second mark, and the recently played Spotify albums built
// from it for Jukebox Mode's Recent drawer.
import { sql } from 'kysely'
import { db } from '../db/database.js'

const TRACK_URI = /^spotify:track:[A-Za-z0-9]{1,64}$/
const SPOTIFY_ID = /^[A-Za-z0-9]{1,64}$/
const MAX_TEXT = 500

export interface SpotifyPlay {
  trackUri: string
  trackName: string
  artistName: string
  albumSpotifyId: string | null
  albumName: string
  albumImageUrl: string | null
}

export interface RecentSpotifyAlbum {
  id: string
  name: string
  imageUrl: string | null
  artistName: string
  last_played: Date
}

const text = (v: unknown) => (typeof v === 'string' ? v.slice(0, MAX_TEXT) : '')

// The client-sent body for POST /spotify/plays, or null when it isn't a
// Spotify track. Optional fields degrade (bad album id → null) rather than
// rejecting the play; only https images are kept, since they're rendered as-is.
export function parseSpotifyPlay(body: unknown): SpotifyPlay | null {
  if (!body || typeof body !== 'object') return null
  const b = body as Record<string, unknown>
  if (typeof b.trackUri !== 'string' || !TRACK_URI.test(b.trackUri)) return null
  const albumId = typeof b.albumSpotifyId === 'string' && SPOTIFY_ID.test(b.albumSpotifyId) ? b.albumSpotifyId : null
  const image = typeof b.albumImageUrl === 'string' && b.albumImageUrl.startsWith('https://') && b.albumImageUrl.length <= MAX_TEXT
    ? b.albumImageUrl
    : null
  return {
    trackUri: b.trackUri,
    trackName: text(b.trackName),
    artistName: text(b.artistName),
    albumSpotifyId: albumId,
    albumName: text(b.albumName),
    albumImageUrl: image,
  }
}

// An object (not bare functions) so route tests can stub it without a database.
export const spotifyPlays = {
  async record(play: SpotifyPlay, meta: { userId: number | null; ipAddress: string | null }): Promise<void> {
    await db.insertInto('spotify_plays').values({
      track_uri: play.trackUri,
      track_name: play.trackName,
      artist_name: play.artistName,
      album_spotify_id: play.albumSpotifyId,
      album_name: play.albumName,
      album_image_url: play.albumImageUrl,
      user_id: meta.userId,
      ip_address: meta.ipAddress,
    }).execute()
  },

  // Most recent play per album, newest first. Album name/image/artist come from
  // that latest play.
  async recentAlbums(size: number): Promise<RecentSpotifyAlbum[]> {
    const { rows } = await sql<RecentSpotifyAlbum>`
      SELECT id, name, "imageUrl", "artistName", last_played FROM (
        SELECT DISTINCT ON (album_spotify_id)
          album_spotify_id AS id, album_name AS name, album_image_url AS "imageUrl",
          artist_name AS "artistName", created_at AS last_played
        FROM spotify_plays
        WHERE album_spotify_id IS NOT NULL
        ORDER BY album_spotify_id, created_at DESC
      ) latest
      ORDER BY last_played DESC
      LIMIT ${size}
    `.execute(db)
    return rows
  },
}

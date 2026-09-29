import { sql } from 'kysely'
import { db } from '../db/database.js'

export const recentPlaylistsService = {
  // Playlists ranked by their most recent logged play (logs.playlist_id is set
  // by GET /log/:id when the queue's source was that playlist). Playlists are
  // deliberately not tag/profile filtered: they have no tags yet.
  async recentlyPlayed(size: number) {
    const result = await sql<{ id: number; name: string; image_path: string | null; last_played: Date }>`
      SELECT p.id, p.name, p.image_path, MAX(lg.created_at) AS last_played
      FROM logs lg
      INNER JOIN playlists p ON p.id = lg.playlist_id
      WHERE lg.playlist_id IS NOT NULL
      GROUP BY p.id, p.name, p.image_path
      ORDER BY last_played DESC
      LIMIT ${size}
    `.execute(db)
    return result.rows
  },
}

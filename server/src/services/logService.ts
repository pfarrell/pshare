import { Kysely, sql } from 'kysely'
import { db, Database } from '../db/database.js'

interface NewLogEntry {
  track_id: number | null
  album_id: number | null
  artist_id: number | null
  action: string
  created_at: Date
  ip_address: string | null
  query?: string | null
  playlist_id?: number | null
  collection_id?: number | null
}

export type LogSource = 'all' | 'library' | 'spotify'

export function parseLogSource(raw: string | undefined): LogSource {
  return raw === 'library' || raw === 'spotify' ? raw : 'all'
}

export interface AdminLogRow {
  source: 'library' | 'spotify'
  id: number
  action: string | null
  query: string | null
  created_at: Date | null
  ip_address: string | null
  track_id: number | null
  track_title: string | null
  album_id: number | null
  album_title: string | null
  artist_id: number | null
  artist_name: string | null
  album_spotify_id: string | null
}

export function createLogService(db: Kysely<Database>) {
  return {

    async countAll(source: LogSource = 'all'): Promise<number> {
      const count = async (table: 'logs' | 'spotify_plays') =>
        Number((await db.selectFrom(table).select(db.fn.count('id').as('count')).executeTakeFirst())?.count ?? 0)
      const [library, spotify] = await Promise.all([
        source === 'spotify' ? 0 : count('logs'),
        source === 'library' ? 0 : count('spotify_plays'),
      ])
      return library + spotify
    },

    // P·Share log rows and Spotify plays (#72) in one list, newest first. Both
    // come back in the logs shape; a Spotify play has action 'spotify', no
    // library ids, its own names, and album_spotify_id for linking.
    // Rows with no created_at (a handful of very old logs) sort last.
    async listPage(limit: number, offset: number, source: LogSource = 'all'): Promise<AdminLogRow[]> {
      // The page is cut from the bare rows first and only its rows get library
      // names joined in: joining before the sort costs ~140ms on the full log.
      const library = sql`
        SELECT 'library' AS source, id, action, query, created_at, ip_address, track_id, album_id, artist_id,
          NULL::text AS track_name, NULL::text AS album_name, NULL::text AS artist_name, NULL::text AS album_spotify_id
        FROM logs`
      const spotify = sql`
        SELECT 'spotify' AS source, id, 'spotify' AS action, NULL::text AS query, created_at, ip_address,
          NULL::int AS track_id, NULL::int AS album_id, NULL::int AS artist_id,
          track_name, album_name, artist_name, album_spotify_id
        FROM spotify_plays`
      const entries = source === 'library' ? library
        : source === 'spotify' ? spotify
        : sql`${library} UNION ALL ${spotify}`
      const { rows } = await sql<AdminLogRow>`
        SELECT e.source, e.id, e.action, e.query, e.created_at, e.ip_address,
          tracks.id AS track_id, COALESCE(tracks.title, e.track_name) AS track_title,
          albums.id AS album_id, COALESCE(albums.title, e.album_name) AS album_title,
          artists.id AS artist_id, COALESCE(artists.name, e.artist_name) AS artist_name,
          e.album_spotify_id
        FROM (
          SELECT * FROM (${entries}) all_entries
          ORDER BY created_at DESC NULLS LAST, id DESC
          LIMIT ${limit} OFFSET ${offset}
        ) e
        LEFT JOIN tracks ON tracks.id = e.track_id
        LEFT JOIN albums ON albums.id = e.album_id
        LEFT JOIN artists ON artists.id = e.artist_id
        ORDER BY e.created_at DESC NULLS LAST, e.id DESC
      `.execute(db)
      return rows
    },

    async findTrackById(id: number) {
      return db
        .selectFrom('tracks')
        .selectAll()
        .where('id', '=', id)
        .executeTakeFirst()
    },

    // The ?playlist= query param is client-supplied, so anything that isn't a
    // positive safe integer naming a real playlist becomes null: a bad value
    // must never stop the play itself from being logged.
    async resolvePlaylistId(raw: string | undefined): Promise<number | null> {
      if (!raw || !/^[1-9]\d*$/.test(raw)) return null
      const id = Number(raw)
      if (!Number.isSafeInteger(id)) return null
      const row = await db.selectFrom('playlists').select('id').where('id', '=', id).executeTakeFirst()
      return row ? row.id : null
    },

    // Same contract as resolvePlaylistId, for the queue's source collection.
    async resolveCollectionId(raw: string | undefined): Promise<number | null> {
      if (!raw || !/^[1-9]\d*$/.test(raw)) return null
      const id = Number(raw)
      if (!Number.isSafeInteger(id)) return null
      const row = await db.selectFrom('collections').select('id').where('id', '=', id).executeTakeFirst()
      return row ? row.id : null
    },

    async record(entry: NewLogEntry) {
      await db.insertInto('logs').values(entry).execute()
    },
  }
}

export const logService = createLogService(db)

import { Kysely } from 'kysely'
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
}

export function createLogService(db: Kysely<Database>) {
  return {
    async countAll() {
      return db
        .selectFrom('logs')
        .select(db.fn.count('id').as('count'))
        .executeTakeFirst()
    },

    async listPage(limit: number, offset: number) {
      return db
        .selectFrom('logs')
        .leftJoin('tracks', 'tracks.id', 'logs.track_id')
        .leftJoin('albums', 'albums.id', 'logs.album_id')
        .leftJoin('artists', 'artists.id', 'logs.artist_id')
        .selectAll('logs')
        .select('tracks.id as track_id')
        .select('tracks.title as track_title')
        .select('albums.id as album_id')
        .select('albums.title as album_title')
        .select('artists.id as artist_id')
        .select('artists.name as artist_name')
        .orderBy('logs.id', 'desc')
        .limit(limit)
        .offset(offset)
        .execute()
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

    async record(entry: NewLogEntry) {
      await db.insertInto('logs').values(entry).execute()
    },
  }
}

export const logService = createLogService(db)

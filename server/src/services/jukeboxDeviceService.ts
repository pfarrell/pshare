import { Kysely } from 'kysely'
import { db, Database } from '../db/database.js'

export function createJukeboxDeviceService(db: Kysely<Database>) {
  return {
    async create(userId: number, name: string) {
      return db
        .insertInto('jukebox_devices')
        .values({ user_id: userId, name })
        .returningAll()
        .executeTakeFirstOrThrow()
    },

    async findById(id: number) {
      return db
        .selectFrom('jukebox_devices')
        .selectAll()
        .where('id', '=', id)
        .executeTakeFirst()
    },
  }
}

export const jukeboxDeviceService = createJukeboxDeviceService(db)

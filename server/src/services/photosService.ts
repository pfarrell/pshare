import type { Kysely } from 'kysely'
import { sql } from 'kysely'
import { db as defaultDb, type Database } from '../db/database.js'

export function createPhotosService(db: Kysely<Database>) {
  const list = () =>
    db
      .selectFrom('photos')
      .leftJoin('media_files', (join) =>
        join.onRef('media_files.entity_id', '=', 'photos.id').on('media_files.entity_type', '=', 'photo')
      )
      .select(['photos.id', 'photos.width', 'photos.height', 'photos.created_at', 'media_files.absolute_path as image_path'])
      .orderBy('photos.created_at', 'desc')
      .execute()

  const create = (width: number, height: number, filename: string) =>
    db.transaction().execute(async (trx) => {
      const photo = await trx.insertInto('photos').values({ width, height }).returningAll().executeTakeFirstOrThrow()
      await trx
        .insertInto('media_files')
        .values({
          entity_type: 'photo',
          entity_id: photo.id,
          discriminator: 'photo',
          absolute_path: filename,
          name: filename,
          file_type: 'image',
          created_at: new Date(),
          updated_at: new Date(),
        })
        .execute()
      return photo
    })

  // Reads the file path inside the same transaction before deleting both
  // rows, so the caller (the route) can remove the file from disk only
  // after the DB delete has actually committed.
  const remove = (id: number) =>
    db.transaction().execute(async (trx) => {
      const mf = await trx.selectFrom('media_files').select('absolute_path')
        .where('entity_type', '=', 'photo').where('entity_id', '=', id).executeTakeFirst()
      const photo = await trx.deleteFrom('photos').where('id', '=', id).returningAll().executeTakeFirst()
      if (!photo) return undefined
      await trx.deleteFrom('media_files').where('entity_type', '=', 'photo').where('entity_id', '=', id).execute()
      return { ...photo, path: mf?.absolute_path ?? null }
    })

  const randomAll = (size: number) =>
    sql<any>`
      SELECT p.id, mf.absolute_path AS image_path
      FROM photos p
      INNER JOIN media_files mf ON mf.entity_type = 'photo' AND mf.entity_id = p.id
      ORDER BY random()
      LIMIT ${size}
    `.execute(db)

  return { list, create, remove, randomAll }
}

export const photosService = createPhotosService(defaultDb)

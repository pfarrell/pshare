// server/src/services/entityImagesService.ts
import type { Kysely } from 'kysely'
import { db as defaultDb, type Database } from '../db/database.js'
import { downloadToDisk } from './imageStorage.js'

export type EntityKind = 'album' | 'artist'

const OWNER_COLUMN = { album: 'album_id', artist: 'artist_id' } as const
const IMAGE_SUBDIR = { album: 'albums', artist: 'artists' } as const

export function createEntityImagesService(db: Kysely<Database>) {
  const syncParentImagePath = async (trx: Kysely<Database>, kind: EntityKind, entityId: number, imagePath: string) => {
    if (kind === 'album') {
      await trx.updateTable('albums').set({ image_path: imagePath, updated_at: new Date() }).where('id', '=', entityId).execute()
    } else {
      await trx.updateTable('artists').set({ image_path: imagePath, updated_at: new Date() }).where('id', '=', entityId).execute()
    }
  }

  const list = (kind: EntityKind, entityId: number) =>
    db
      .selectFrom('images')
      .leftJoin('media_files', (join) =>
        join.onRef('media_files.entity_id', '=', 'images.id').on('media_files.entity_type', '=', 'image')
      )
      .select([
        'images.id',
        'images.is_primary',
        'images.source',
        'images.status',
        'images.width',
        'images.height',
        'images.created_at',
        'media_files.absolute_path as path',
      ])
      .where(`images.${OWNER_COLUMN[kind]}` as any, '=', entityId)
      // 'not_found' rows are bookkeeping only (an external lookup came back
      // empty) — they have no backing file and would render as a blank tile.
      .where('images.status', '!=', 'not_found')
      .orderBy('images.is_primary', 'desc')
      .orderBy('images.created_at', 'asc')
      .execute()

  const createRecord = (
    kind: EntityKind,
    entityId: number,
    filePath: string,
    source: string,
    isPrimary: boolean,
    status: string = 'active'
  ) =>
    db.transaction().execute(async (trx) => {
      // If primary, clear other primaries first (before inserting) to avoid constraint violation
      if (isPrimary) {
        await trx.updateTable('images').set({ is_primary: false })
          .where(OWNER_COLUMN[kind], '=', entityId)
          .execute()
      }

      const image = await trx
        .insertInto('images')
        .values({
          ...(kind === 'album' ? { album_id: entityId } : { artist_id: entityId }),
          is_primary: isPrimary,
          source,
          status,
        })
        .returningAll()
        .executeTakeFirstOrThrow()

      await trx
        .insertInto('media_files')
        .values({
          entity_type: 'image',
          entity_id: image.id,
          discriminator: 'image',
          absolute_path: filePath,
          name: filePath,
          file_type: 'image',
          created_at: new Date(),
          updated_at: new Date(),
        })
        .execute()

      if (isPrimary) {
        await syncParentImagePath(trx, kind, entityId, filePath)
      }

      return image
    })

  const add = async (kind: EntityKind, entityId: number, { imageUrl, imageName, setPrimary }: { imageUrl: string; imageName: string; setPrimary: boolean }) => {
    const filePath = await downloadToDisk(imageUrl, imageName, IMAGE_SUBDIR[kind])
    return createRecord(kind, entityId, filePath, 'manual', setPrimary)
  }

  const setPrimary = (kind: EntityKind, entityId: number, imageId: number) =>
    db.transaction().execute(async (trx) => {
      const owned = await trx.selectFrom('images').select('id')
        .where('id', '=', imageId)
        .where(OWNER_COLUMN[kind], '=', entityId)
        .executeTakeFirst()
      if (!owned) return undefined

      await trx.updateTable('images').set({ is_primary: false }).where(OWNER_COLUMN[kind], '=', entityId).execute()
      const image = await trx.updateTable('images').set({ is_primary: true })
        .where('id', '=', imageId)
        .returningAll()
        .executeTakeFirstOrThrow()

      const mf = await trx.selectFrom('media_files').select('absolute_path')
        .where('entity_type', '=', 'image')
        .where('entity_id', '=', imageId)
        .executeTakeFirst()
      if (mf?.absolute_path) await syncParentImagePath(trx, kind, entityId, mf.absolute_path)

      return image
    })

  const remove = (kind: EntityKind, entityId: number, imageId: number) =>
    db.transaction().execute(async (trx) => {
      const image = await trx.deleteFrom('images')
        .where('id', '=', imageId)
        .where(OWNER_COLUMN[kind], '=', entityId)
        .returningAll()
        .executeTakeFirst()
      if (!image) return false
      await trx.deleteFrom('media_files').where('entity_type', '=', 'image').where('entity_id', '=', imageId).execute()
      return true
    })

  return { list, createRecord, add, setPrimary, remove }
}

export const entityImagesService = createEntityImagesService(defaultDb)

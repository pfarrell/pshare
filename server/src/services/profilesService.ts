import { Kysely } from 'kysely'
import { db, Database } from '../db/database.js'

export function createProfilesService(db: Kysely<Database>) {
  return {
    async list() {
      const profiles = await db.selectFrom('profiles').selectAll().orderBy('name', 'asc').execute()
      if (profiles.length === 0) return []

      const profileIds = profiles.map((p) => p.id)
      const tagRows = await db
        .selectFrom('profile_tags')
        .innerJoin('tags', 'tags.id', 'profile_tags.tag_id')
        .select(['profile_tags.profile_id', 'tags.id as tag_id', 'tags.name as tag_name'])
        .where('profile_tags.profile_id', 'in', profileIds)
        .orderBy('tags.name', 'asc')
        .execute()

      const tagsByProfile = new Map<number, { id: number; name: string }[]>()
      for (const row of tagRows) {
        const list = tagsByProfile.get(row.profile_id) ?? []
        list.push({ id: row.tag_id, name: row.tag_name })
        tagsByProfile.set(row.profile_id, list)
      }

      return profiles.map((p) => ({ id: p.id, name: p.name, tags: tagsByProfile.get(p.id) ?? [] }))
    },

    async getTagIds(profileId: number): Promise<number[]> {
      const rows = await db
        .selectFrom('profile_tags')
        .select('tag_id')
        .where('profile_id', '=', profileId)
        .execute()
      return rows.map((r) => r.tag_id)
    },

    async findByName(name: string) {
      return db.selectFrom('profiles').select('id').where('name', '=', name).executeTakeFirst()
    },

    async findById(id: number) {
      return db.selectFrom('profiles').select(['id', 'name']).where('id', '=', id).executeTakeFirst()
    },

    async create(name: string, tagIds: number[]) {
      const profile = await db.insertInto('profiles').values({ name }).returning(['id', 'name']).executeTakeFirstOrThrow()
      if (tagIds.length > 0) {
        await db.insertInto('profile_tags').values(tagIds.map((tag_id) => ({ profile_id: profile.id, tag_id }))).execute()
      }
      return profile
    },

    async update(id: number, name: string, tagIds: number[]) {
      const updated = await db
        .updateTable('profiles')
        .set({ name, updated_at: new Date().toISOString() })
        .where('id', '=', id)
        .returning(['id', 'name'])
        .executeTakeFirst()
      if (!updated) return undefined

      await db.deleteFrom('profile_tags').where('profile_id', '=', id).execute()
      if (tagIds.length > 0) {
        await db.insertInto('profile_tags').values(tagIds.map((tag_id) => ({ profile_id: id, tag_id }))).execute()
      }
      return updated
    },

    async remove(id: number): Promise<boolean> {
      const deleted = await db.deleteFrom('profiles').where('id', '=', id).returning('id').executeTakeFirst()
      return !!deleted
    },
  }
}

export const profilesService = createProfilesService(db)

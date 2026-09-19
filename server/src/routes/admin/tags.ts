import { Hono } from 'hono'
import { db } from '../../db/database.js'

const router = new Hono()

// GET /admin/tags — list all tags with usage counts, for the tag moderation page
router.get('/tags', async (c) => {
  const rows = await db
    .selectFrom('tags')
    .leftJoin('artists_tags', 'artists_tags.tag_id', 'tags.id')
    .leftJoin('albums_tags', 'albums_tags.tag_id', 'tags.id')
    .select((eb) => [
      'tags.id',
      'tags.name',
      eb.fn.count<number>('artists_tags.artist_id').distinct().as('artist_count'),
      eb.fn.count<number>('albums_tags.album_id').distinct().as('album_count'),
    ])
    .groupBy(['tags.id', 'tags.name'])
    .orderBy('tags.name', 'asc')
    .execute()

  return c.json(rows)
})

// DELETE /admin/tags/:id — delete a tag entirely, removing it from every artist/album
router.delete('/tags/:id', async (c) => {
  const id = parseInt(c.req.param('id'))

  try {
    const tag = await db.selectFrom('tags').select('id').where('id', '=', id).executeTakeFirst()
    if (!tag) return c.json({ error: 'Tag not found' }, 404)

    await db.deleteFrom('artists_tags').where('tag_id', '=', id).execute()
    await db.deleteFrom('albums_tags').where('tag_id', '=', id).execute()
    const deleted = await db.deleteFrom('tags').where('id', '=', id).returningAll().executeTakeFirst()

    return c.json({ success: true, deleted })
  } catch (error) {
    console.error('Error deleting tag:', error)
    return c.json({ error: 'Failed to delete tag' }, 500)
  }
})

export default router

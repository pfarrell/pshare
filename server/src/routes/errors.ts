import { Hono } from 'hono'
import { db } from '../db/database.js'
import { errorLogService } from '../services/errorLogService.js'
import { paginate } from '../utils/http.js'

const errors = new Hono()

// GET /admin/errors?page=1&limit=25&source=upload
errors.get('/', async (c) => {
  const source = c.req.query('source') || undefined
  const { items, pagination } = await paginate(c, {
    count: async () => Number((await errorLogService.countAll(source))?.count ?? 0),
    listPage: (limit, offset) => errorLogService.listPage(limit, offset, source),
  })
  return c.json({ errors: items, pagination })
})

// DELETE /admin/errors - clear every error_log row.
// Registered before /:id so this path can never be misrouted there.
errors.delete('/', async (c) => {
  const result = await db.deleteFrom('error_log').executeTakeFirst()
  return c.json({ success: true, deleted: Number(result.numDeletedRows) })
})

// DELETE /admin/errors/:id - dismiss a single error_log row.
errors.delete('/:id', async (c) => {
  const id = parseInt(c.req.param('id'))
  if (isNaN(id)) return c.json({ error: 'Invalid id' }, 400)

  const deleted = await db
    .deleteFrom('error_log')
    .where('id', '=', id)
    .returningAll()
    .executeTakeFirst()

  if (!deleted) return c.json({ error: 'Error not found' }, 404)
  return c.json({ success: true })
})

export default errors

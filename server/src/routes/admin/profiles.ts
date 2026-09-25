// Mounted under /admin (behind requireAdmin in src/index.ts), same pattern
// as admin/tags.ts.
import { Hono } from 'hono'
import { db } from '../../db/database.js'
import { profilesService } from '../../services/profilesService.js'

const router = new Hono()

function parseTagIds(raw: unknown): number[] | null {
  if (!Array.isArray(raw)) return null
  if (raw.some((v) => typeof v !== 'number' || !Number.isInteger(v))) return null
  return raw
}

// POST /admin/profiles — create a profile
router.post('/profiles', async (c) => {
  const body = await c.req.json()
  const name = typeof body.name === 'string' ? body.name.trim() : ''
  const tagIds = parseTagIds(body.tag_ids)

  if (!name) return c.json({ error: 'name required' }, 400)
  if (!tagIds || tagIds.length === 0) return c.json({ error: 'tag_ids must be a non-empty array of tag ids' }, 400)

  const existing = await profilesService.findByName(name)
  if (existing) return c.json({ error: 'A profile with that name already exists' }, 409)

  const created = await profilesService.create(name, tagIds)
  return c.json(created, 201)
})

// PUT /admin/profiles/:id — rename and fully replace the tag set
router.put('/profiles/:id', async (c) => {
  const id = parseInt(c.req.param('id'))
  const body = await c.req.json()
  const name = typeof body.name === 'string' ? body.name.trim() : ''
  const tagIds = parseTagIds(body.tag_ids)

  if (!name) return c.json({ error: 'name required' }, 400)
  if (!tagIds || tagIds.length === 0) return c.json({ error: 'tag_ids must be a non-empty array of tag ids' }, 400)

  const existing = await profilesService.findByName(name)
  if (existing && existing.id !== id) return c.json({ error: 'A profile with that name already exists' }, 409)

  const updated = await profilesService.update(id, name, tagIds)
  if (!updated) return c.json({ error: 'Profile not found' }, 404)
  return c.json(updated)
})

// DELETE /admin/profiles/:id
router.delete('/profiles/:id', async (c) => {
  const id = parseInt(c.req.param('id'))
  const removed = await profilesService.remove(id)
  if (!removed) return c.json({ error: 'Profile not found' }, 404)
  return c.json({ success: true })
})

export default router

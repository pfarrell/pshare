// Mounted under /admin (behind requireAdmin in src/index.ts), same pattern
// as admin/tags.ts.
import { Hono } from 'hono'
import { db } from '../../db/database.js'
import { profilesService } from '../../services/profilesService.js'
import { sseBroadcaster } from '../../services/sseBroadcaster.js'

const router = new Hono()

// De-duplicates: a repeated id would otherwise violate
// profile_tags' UNIQUE (profile_id, tag_id) and surface as a raw 500.
function parseTagIds(raw: unknown): number[] | null {
  if (!Array.isArray(raw)) return null
  if (raw.some((v) => typeof v !== 'number' || !Number.isInteger(v))) return null
  return [...new Set(raw as number[])]
}

// Every id must reference a real tags row — checked here rather than letting
// profile_tags' FK throw, so a bad id is a 400 with a usable message.
async function findMissingTagIds(tagIds: number[]): Promise<number[]> {
  const rows = await db.selectFrom('tags').select('id').where('id', 'in', tagIds).execute()
  const found = new Set(rows.map((r) => r.id))
  return tagIds.filter((id) => !found.has(id))
}

// POST /admin/profiles — create a profile
router.post('/profiles', async (c) => {
  try {
    const body = await c.req.json()
    const name = typeof body.name === 'string' ? body.name.trim() : ''
    const tagIds = parseTagIds(body.tag_ids)

    if (!name) return c.json({ error: 'name required' }, 400)
    if (!tagIds || tagIds.length === 0) return c.json({ error: 'tag_ids must be a non-empty array of tag ids' }, 400)

    const missing = await findMissingTagIds(tagIds)
    if (missing.length > 0) return c.json({ error: `Unknown tag ids: ${missing.join(', ')}` }, 400)

    const existing = await profilesService.findByName(name)
    if (existing) return c.json({ error: 'A profile with that name already exists' }, 409)

    const created = await profilesService.create(name, tagIds)
    sseBroadcaster.broadcastProfilesChanged()
    return c.json(created, 201)
  } catch (error) {
    console.error('Error creating profile:', error)
    return c.json({ error: 'Failed to create profile' }, 500)
  }
})

// PUT /admin/profiles/:id — rename and fully replace the tag set
router.put('/profiles/:id', async (c) => {
  try {
    const id = parseInt(c.req.param('id'))
    const body = await c.req.json()
    const name = typeof body.name === 'string' ? body.name.trim() : ''
    const tagIds = parseTagIds(body.tag_ids)

    if (!name) return c.json({ error: 'name required' }, 400)
    if (!tagIds || tagIds.length === 0) return c.json({ error: 'tag_ids must be a non-empty array of tag ids' }, 400)

    const missing = await findMissingTagIds(tagIds)
    if (missing.length > 0) return c.json({ error: `Unknown tag ids: ${missing.join(', ')}` }, 400)

    const existing = await profilesService.findByName(name)
    if (existing && existing.id !== id) return c.json({ error: 'A profile with that name already exists' }, 409)

    const updated = await profilesService.update(id, name, tagIds)
    if (!updated) return c.json({ error: 'Profile not found' }, 404)
    sseBroadcaster.broadcastProfilesChanged()
    return c.json(updated)
  } catch (error) {
    console.error('Error updating profile:', error)
    return c.json({ error: 'Failed to update profile' }, 500)
  }
})

// DELETE /admin/profiles/:id
router.delete('/profiles/:id', async (c) => {
  try {
    const id = parseInt(c.req.param('id'))
    const removed = await profilesService.remove(id)
    if (!removed) return c.json({ error: 'Profile not found' }, 404)
    sseBroadcaster.broadcastProfilesChanged()
    return c.json({ success: true })
  } catch (error) {
    console.error('Error deleting profile:', error)
    return c.json({ error: 'Failed to delete profile' }, 500)
  }
})

export default router

// server/src/routes/admin/factoids.ts
// Mounted under /admin behind requireAdmin in src/index.ts. Delete-only
// moderation plus a re-research escape hatch: factoids auto-publish, and this
// is the recourse for one that is wrong or dull.
import { Hono } from 'hono'
import { db } from '../../db/database.js'
import { listForTarget, deleteFactoid, updateFactoidText, countAllForAdmin, listAllForAdmin, type AdminFactoidFilter } from '../../services/factoidStore.js'
import { sanitizeText, MAX_FACTOID_LENGTH } from '../../services/factoidValidation.js'
import { paginate } from '../../utils/http.js'

const router = new Hono()

// GET /admin/factoids?kind=album&target_id=12
router.get('/factoids', async (c) => {
  const kind = c.req.query('kind')
  const targetId = parseInt(c.req.query('target_id') ?? '', 10)
  if (kind !== 'artist' && kind !== 'album' && kind !== 'track') {
    return c.json({ error: 'kind must be artist, album, or track' }, 400)
  }
  if (!Number.isFinite(targetId)) return c.json({ error: 'target_id is required' }, 400)

  try {
    const factoids = await listForTarget(kind, targetId)
    const generation = kind === 'track' ? undefined : await db
      .selectFrom('factoid_generations')
      .select(['id', 'status', 'attempts', 'factoid_count', 'error', 'updated_at'])
      .where('kind', '=', kind)
      .where('target_id', '=', targetId)
      .executeTakeFirst()
    return c.json({ factoids, generation: generation ?? null })
  } catch (error) {
    console.error('Error listing factoids:', error)
    return c.json({ error: 'Failed to list factoids' }, 500)
  }
})

// GET /admin/factoids/all?page=1&limit=25&kind=album&q=text: every factoid,
// newest first, for the global review page. Registered as /factoids/all (not
// /factoids?list=1) so it cannot be confused with the per-entity lookup above.
router.get('/factoids/all', async (c) => {
  const rawKind = c.req.query('kind') || undefined
  const validKind = rawKind === 'artist' || rawKind === 'album' || rawKind === 'track'
  if (rawKind !== undefined && !validKind) {
    return c.json({ error: 'kind must be artist, album, or track' }, 400)
  }
  const filter: AdminFactoidFilter = {
    kind: validKind ? rawKind : undefined,
    q: c.req.query('q')?.trim().slice(0, 200) || undefined,
  }
  try {
    const { items, pagination } = await paginate(c, {
      count: () => countAllForAdmin(filter),
      listPage: (limit, offset) => listAllForAdmin(filter, limit, offset),
    })
    return c.json({ factoids: items, pagination })
  } catch (error) {
    console.error('Error listing all factoids:', error)
    return c.json({ error: 'Failed to list factoids' }, 500)
  }
})

// PATCH /admin/factoids/:id { text }: a human edit, usually to add the few
// words of context a fact lacks. Held to the same rules as generated text.
router.patch('/factoids/:id', async (c) => {
  const id = parseInt(c.req.param('id'), 10)
  if (!Number.isFinite(id)) return c.json({ error: 'Invalid id' }, 400)

  const body = await c.req.json().catch(() => null) as { text?: unknown } | null
  if (typeof body?.text !== 'string') return c.json({ error: 'text is required' }, 400)
  const text = sanitizeText(body.text)
  if (!text) return c.json({ error: 'text must not be empty' }, 400)
  if (text.length > MAX_FACTOID_LENGTH) {
    return c.json({ error: `text must be at most ${MAX_FACTOID_LENGTH} characters` }, 400)
  }

  try {
    const updated = await updateFactoidText(id, text)
    if (!updated) return c.json({ error: 'Factoid not found' }, 404)
    return c.json({ factoid: updated })
  } catch (error) {
    console.error('Error updating factoid:', error)
    return c.json({ error: 'Failed to update factoid' }, 500)
  }
})

router.delete('/factoids/:id', async (c) => {
  const id = parseInt(c.req.param('id'), 10)
  if (!Number.isFinite(id)) return c.json({ error: 'Invalid id' }, 400)
  try {
    const existed = await deleteFactoid(id)
    if (!existed) return c.json({ error: 'Factoid not found' }, 404)
    return c.json({ success: true })
  } catch (error) {
    console.error('Error deleting factoid:', error)
    return c.json({ error: 'Failed to delete factoid' }, 500)
  }
})

// Clearing the ledger row is what lets the poller pick the entity up again.
router.delete('/factoids/generations/:kind/:id', async (c) => {
  const kind = c.req.param('kind')
  const targetId = parseInt(c.req.param('id'), 10)
  if (kind !== 'artist' && kind !== 'album') return c.json({ error: 'kind must be artist or album' }, 400)
  if (!Number.isFinite(targetId)) return c.json({ error: 'Invalid id' }, 400)
  try {
    await db.deleteFrom('factoid_generations').where('kind', '=', kind).where('target_id', '=', targetId).execute()
    return c.json({ success: true })
  } catch (error) {
    console.error('Error clearing factoid generation:', error)
    return c.json({ error: 'Failed to clear generation' }, 500)
  }
})

export default router

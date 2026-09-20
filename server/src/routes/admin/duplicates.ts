import { Hono } from 'hono'
import type { Variables } from '../../types.js'
import { db } from '../../db/database.js'

const router = new Hono<{ Variables: Variables }>()

router.post('/duplicates/dismiss', async (c) => {
  const body = await c.req.json()
  const { kind, entity_a_id, entity_b_id } = body
  if (kind !== 'album' && kind !== 'track') {
    return c.json({ error: 'kind must be "album" or "track"' }, 400)
  }
  const idA = parseInt(entity_a_id)
  const idB = parseInt(entity_b_id)
  if (!Number.isInteger(idA) || !Number.isInteger(idB) || idA === idB) {
    return c.json({ error: 'entity_a_id and entity_b_id must be distinct integers' }, 400)
  }
  const [lo, hi] = idA < idB ? [idA, idB] : [idB, idA]
  const user = c.get('user')

  await db
    .insertInto('dismissed_duplicates')
    .values({ kind, entity_a_id: lo, entity_b_id: hi, dismissed_by: user?.id ?? null })
    .onConflict((oc) => oc.columns(['kind', 'entity_a_id', 'entity_b_id']).doNothing())
    .execute()

  return c.json({ success: true })
})

export default router

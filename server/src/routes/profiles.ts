import { Hono } from 'hono'
import { requireAuth } from '../middleware/auth.js'
import { profilesService } from '../services/profilesService.js'
import type { Variables } from '../types.js'

const profiles = new Hono<{ Variables: Variables }>()

// GET /profiles — list every profile with its tags, for any picker
// (header dropdown, Account page, jukebox's gear-icon picker).
profiles.get('/', requireAuth, async (c) => {
  const rows = await profilesService.list()
  return c.json(rows)
})

export default profiles

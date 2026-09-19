import { Hono } from 'hono'
import { logService } from '../services/logService.js'
import { requireAdmin } from '../middleware/auth.js'
import { extractIpAddress } from '../utils/requestIp.js'
import { paginate } from '../utils/http.js'
import type { Variables } from '../types.js'

const logs = new Hono<{ Variables: Variables }>()

// GET /log/admin?page=1&limit=25 — admin view of logs with pagination
// IMPORTANT: This must come before /:id route to avoid matching "admin" as an ID
logs.get('/admin', requireAdmin, async (c) => {
  const { items, pagination } = await paginate(c, {
    count: async () => Number((await logService.countAll())?.count ?? 0),
    listPage: (limit, offset) => logService.listPage(limit, offset),
  })
  return c.json({ logs: items, pagination })
})

// GET /log/:id  — log a play event at the 5-second mark
logs.get('/:id', async (c) => {
  const id = parseInt(c.req.param('id'))

  const track = await logService.findTrackById(id)

  if (!track) return c.text('', 200)

  // Get IP address from request, checking for proxy headers
  const ip_address = extractIpAddress(c)

  await logService.record({
    track_id: track.id,
    album_id: track.album_id,
    artist_id: track.artist_id,
    action: 'stream',
    created_at: new Date(),
    ip_address,
  })

  return c.text('', 200)
})

export default logs

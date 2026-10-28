import { Hono } from 'hono'
import { logService, parseLogSource } from '../services/logService.js'
import { requireAdmin } from '../middleware/auth.js'
import { extractIpAddress } from '../utils/requestIp.js'
import { paginate } from '../utils/http.js'
import type { Variables } from '../types.js'

const logs = new Hono<{ Variables: Variables }>()

// GET /log/admin?page=1&limit=25&source=all|library|spotify — admin view of
// P·Share logs and Spotify plays (#72), newest first, with pagination
// IMPORTANT: This must come before /:id route to avoid matching "admin" as an ID
logs.get('/admin', requireAdmin, async (c) => {
  const source = parseLogSource(c.req.query('source'))
  const { items, pagination } = await paginate(c, {
    count: () => logService.countAll(source),
    listPage: (limit, offset) => logService.listPage(limit, offset, source),
  })
  return c.json({ logs: items, pagination })
})

// GET /log/:id?playlist=<id>|collection=<id>  — log a play event at the
// 5-second mark; the optional playlist/collection is the queue's source
// (ignored if invalid)
logs.get('/:id', async (c) => {
  const id = parseInt(c.req.param('id'))

  const track = await logService.findTrackById(id)

  if (!track) return c.text('', 200)

  // Get IP address from request, checking for proxy headers
  const ip_address = extractIpAddress(c)

  const playlist_id = await logService.resolvePlaylistId(c.req.query('playlist'))
  const collection_id = await logService.resolveCollectionId(c.req.query('collection'))

  await logService.record({
    track_id: track.id,
    album_id: track.album_id,
    artist_id: track.artist_id,
    action: 'stream',
    created_at: new Date(),
    ip_address,
    playlist_id,
    collection_id,
  })

  return c.text('', 200)
})

export default logs

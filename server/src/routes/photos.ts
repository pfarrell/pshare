import { Hono } from 'hono'
import { photosService } from '../services/photosService.js'

const photos = new Hono()

// GET /photos/random?size=N — requireAuth is applied by the parent
// protectedApp router this is mounted under (see server/src/index.ts), not
// inline here: every route on this file needs it, unlike albums.ts/
// artists.ts, which also serve genuinely public per-id detail pages from
// the same file and so self-guard per route instead.
photos.get('/random', async (c) => {
  const size = Math.min(parseInt(c.req.query('size') ?? '10'), 200)
  const result = await photosService.randomAll(size)
  return c.json(result.rows)
})

export default photos

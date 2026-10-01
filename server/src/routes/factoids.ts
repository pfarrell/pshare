// server/src/routes/factoids.ts
// The kiosk read path. Never generates: a factoid that is not already cached
// simply is not shown, which is what keeps an idle kiosk free and instant.
// Dependency-injected for testability, following notesRoutes.ts.
import { Hono, type Context } from 'hono'
import { listForTrack, randomFactoids, type FactoidForDisplay } from '../services/factoidStore.js'

export interface FactoidRouteDeps {
  listForTrack: (trackId: number, limit?: number) => Promise<FactoidForDisplay[]>
  randomFactoids: (limit?: number) => Promise<FactoidForDisplay[]>
}

export function createFactoidsRoutes(deps: FactoidRouteDeps): Hono {
  const router = new Hono()

  // A failure here must never blank the kiosk, and an empty list is already a
  // state the screensaver handles (it falls back to art rotation). So every
  // failure degrades to an empty 200 rather than an error status.
  const respond = async (c: Context, load: () => Promise<FactoidForDisplay[]>) => {
    try {
      return c.json({ factoids: await load() })
    } catch (error) {
      console.error('Error loading factoids:', error)
      return c.json({ factoids: [] })
    }
  }

  router.get('/random', (c) => respond(c, () => deps.randomFactoids()))

  router.get('/', (c) => {
    const raw = c.req.query('track_id')
    const trackId = raw === undefined ? NaN : parseInt(raw, 10)
    // A missing or unparseable track_id means "nothing is playing" as far as
    // the kiosk is concerned, which is exactly the random case.
    return respond(c, () => Number.isFinite(trackId)
      ? deps.listForTrack(trackId)
      : deps.randomFactoids())
  })

  return router
}

export default createFactoidsRoutes({ listForTrack, randomFactoids })

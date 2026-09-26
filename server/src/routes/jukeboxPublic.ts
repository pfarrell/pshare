// server/src/routes/jukeboxPublic.ts
// Public, token-scoped surface for phone visitors reached via a kiosk's QR
// code (see docs/superpowers/specs/2026-09-25-jukebox-server-queue-design.md).
// Grants exactly two things: search, and submitting a track. Never exposes
// the events stream, the pending-queue catch-up endpoint, or profile data —
// those live on the kiosk-authenticated surface in jukeboxDevices.ts.
import { Hono } from 'hono'
import { jukeboxQueueService } from '../services/jukeboxQueueService.js'
import { handleSearchRequest } from './search.js'

const jukeboxPublic = new Hono()

async function loadDeviceByToken(c: any, next: any) {
  const device = await jukeboxQueueService.findDeviceByToken(c.req.param('token'))
  if (!device) return c.json({ error: 'Not found' }, 404)
  c.set('jukeboxTokenDevice', device)
  await next()
}

jukeboxPublic.get('/:token/search', loadDeviceByToken, handleSearchRequest)

export default jukeboxPublic

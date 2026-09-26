// server/src/routes/jukeboxPublic.ts
// Public, token-scoped surface for phone visitors reached via a kiosk's QR
// code (see docs/superpowers/specs/2026-09-25-jukebox-server-queue-design.md).
// Grants exactly two things: search, and submitting a track. Never exposes
// the events stream, the pending-queue catch-up endpoint, or profile data —
// those live on the kiosk-authenticated surface in jukeboxDevices.ts.
import { Hono } from 'hono'
import { getCookie } from 'hono/cookie'
import jwt from 'jsonwebtoken'
import { jukeboxQueueService } from '../services/jukeboxQueueService.js'
import { sseBroadcaster } from '../services/sseBroadcaster.js'
import { createFixedWindowLimiter } from '../utils/rateLimit.js'
import { handleSearchRequest } from './search.js'

const JWT_SECRET = process.env.BEMUSED_JWT_SECRET || 'default-secret-change-me'

const jukeboxPublic = new Hono()

async function loadDeviceByToken(c: any, next: any) {
  const device = await jukeboxQueueService.findDeviceByToken(c.req.param('token'))
  if (!device) return c.json({ error: 'Not found' }, 404)
  c.set('jukeboxTokenDevice', device)
  await next()
}

jukeboxPublic.get('/:token/search', loadDeviceByToken, handleSearchRequest)

// Cheap abuse protection against one QR-code token spamming submissions —
// keyed by enqueue_token, one limiter instance shared by every request this
// process handles (see rateLimit.ts).
const submissionsAllowed = createFixedWindowLimiter(30, 60_000)

jukeboxPublic.post('/:token/queue', loadDeviceByToken, async (c: any) => {
  const device = c.get('jukeboxTokenDevice')

  if (!submissionsAllowed(device.enqueue_token)) {
    return c.json({ error: 'Too many submissions, try again in a moment' }, 429)
  }

  const body = await c.req.json()
  const trackIds: number[] = Array.isArray(body.trackIds)
    ? body.trackIds.filter((id: unknown) => Number.isInteger(id))
    : []
  if (trackIds.length === 0) return c.json({ error: 'trackIds must be a non-empty array of track ids' }, 400)

  // A logged-in submitter is attributed by their account, ignoring any name
  // in the body — matches the spec's "if the request carries a valid auth
  // cookie, submitted_by_user_id is set from it (ignoring name)".
  let userId: number | null = null
  const authCookie = getCookie(c, 'auth')
  if (authCookie) {
    try {
      const decoded = jwt.verify(authCookie, JWT_SECRET, { algorithms: ['HS256'] }) as { id: number }
      userId = decoded.id
    } catch {
      // Invalid/expired cookie — fall through and treat this as a guest submission.
    }
  }

  const name = typeof body.name === 'string' ? body.name.trim().slice(0, 50) : ''
  if (!userId && !name) return c.json({ error: 'name is required' }, 400)

  const submissions = await Promise.all(
    trackIds.map((trackId) => jukeboxQueueService.submit(device.id, trackId, userId ? { userId } : { name }))
  )

  submissions.forEach((submission) => sseBroadcaster.broadcastQueueItemAdded(device.id, submission))

  return c.json(submissions, 201)
})

export default jukeboxPublic

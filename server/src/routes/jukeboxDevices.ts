// server/src/routes/jukeboxDevices.ts
// Kiosk-authenticated surface (the existing device JWT/cookie, never the
// public enqueue_token) — see
// docs/superpowers/specs/2026-09-25-jukebox-server-queue-design.md.
// Every route here is guarded by requireOwnJukeboxDevice: a device can only
// ever act on its own queue, even one owned by the same account as another
// device.
import { Hono } from 'hono'
import { requireOwnJukeboxDevice } from '../middleware/auth.js'
import { jukeboxQueueService } from '../services/jukeboxQueueService.js'

const jukeboxDevices = new Hono()

jukeboxDevices.get('/:id/queue/pending', requireOwnJukeboxDevice, async (c) => {
  const deviceId = parseInt(c.req.param('id'))
  const pending = await jukeboxQueueService.listPending(deviceId)
  return c.json(pending)
})

jukeboxDevices.post('/:id/queue/:submissionId/delivered', requireOwnJukeboxDevice, async (c) => {
  const deviceId = parseInt(c.req.param('id'))
  const submissionId = parseInt(c.req.param('submissionId'))
  const marked = await jukeboxQueueService.markDelivered(deviceId, submissionId)
  if (!marked) return c.json({ error: 'Submission not found' }, 404)
  return c.json({ success: true })
})

jukeboxDevices.post('/:id/rotate-token', requireOwnJukeboxDevice, async (c) => {
  const deviceId = parseInt(c.req.param('id'))
  const enqueue_token = await jukeboxQueueService.rotateToken(deviceId)
  return c.json({ enqueue_token })
})

export default jukeboxDevices

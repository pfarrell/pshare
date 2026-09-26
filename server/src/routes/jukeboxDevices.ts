// server/src/routes/jukeboxDevices.ts
// Kiosk-authenticated surface (the existing device JWT/cookie, never the
// public enqueue_token) — see
// docs/superpowers/specs/2026-09-25-jukebox-server-queue-design.md.
// Every route here is guarded by requireOwnJukeboxDevice: a device can only
// ever act on its own queue, even one owned by the same account as another
// device.
import { Hono } from 'hono'
import { streamSSE } from 'hono/streaming'
import { requireOwnJukeboxDevice } from '../middleware/auth.js'
import { jukeboxQueueService } from '../services/jukeboxQueueService.js'
import { sseBroadcaster } from '../services/sseBroadcaster.js'

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

jukeboxDevices.get('/:id/events', requireOwnJukeboxDevice, async (c) => {
  const deviceId = parseInt(c.req.param('id'))

  return streamSSE(c, async (stream) => {
    const pending: Array<{ event: string; data: string }> = []
    let notify: (() => void) | null = null

    const push = (event: string, data: unknown) => {
      pending.push({ event, data: JSON.stringify(data) })
      notify?.()
    }

    const unsubQueue = sseBroadcaster.subscribeToDevice(deviceId, (payload) => push('queue-item-added', payload))
    const unsubProfiles = sseBroadcaster.subscribeToProfiles(() => push('profiles-changed', {}))

    stream.onAbort(() => {
      unsubQueue()
      unsubProfiles()
      notify?.()
    })

    try {
      while (!stream.closed && !stream.aborted) {
        if (pending.length === 0) {
          await new Promise<void>((resolve) => { notify = resolve })
          notify = null
        }
        while (pending.length > 0) {
          const next = pending.shift()!
          await stream.writeSSE(next)
        }
      }
    } finally {
      unsubQueue()
      unsubProfiles()
    }
  })
})

export default jukeboxDevices

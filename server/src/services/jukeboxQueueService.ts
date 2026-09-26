// server/src/services/jukeboxQueueService.ts
import crypto from 'node:crypto'
import { db } from '../db/database.js'

export const jukeboxQueueService = {
  async findDeviceByToken(token: string) {
    return db
      .selectFrom('jukebox_devices')
      .selectAll()
      .where('enqueue_token', '=', token)
      .executeTakeFirst()
  },

  async rotateToken(deviceId: number): Promise<string> {
    const token = crypto.randomBytes(24).toString('base64url')
    await db
      .updateTable('jukebox_devices')
      .set({ enqueue_token: token })
      .where('id', '=', deviceId)
      .execute()
    return token
  },

  async submit(
    deviceId: number,
    trackId: number,
    { name, userId }: { name?: string | null; userId?: number | null } = {}
  ) {
    return db
      .insertInto('jukebox_queue_submissions')
      .values({
        jukebox_device_id: deviceId,
        track_id: trackId,
        submitted_by_name: userId ? null : (name ?? null),
        submitted_by_user_id: userId ?? null,
      })
      .returningAll()
      .executeTakeFirstOrThrow()
  },

  async listPending(deviceId: number) {
    return db
      .selectFrom('jukebox_queue_submissions')
      .selectAll()
      .where('jukebox_device_id', '=', deviceId)
      .where('delivered_at', 'is', null)
      .orderBy('submitted_at', 'asc')
      .execute()
  },

  async markDelivered(deviceId: number, submissionId: number): Promise<boolean> {
    const result = await db
      .updateTable('jukebox_queue_submissions')
      .set({ delivered_at: new Date() })
      .where('id', '=', submissionId)
      .where('jukebox_device_id', '=', deviceId)
      .executeTakeFirst()
    return (result.numUpdatedRows ?? 0n) > 0n
  },
}

export type JukeboxQueueSubmission = Awaited<ReturnType<typeof jukeboxQueueService.submit>>

// EXPERIMENTAL (issue #72): encrypted Spotify OAuth tokens per user or jukebox device.
import { Kysely } from 'kysely'
import { db, Database } from '../db/database.js'
import { encryptRecallToken, decryptRecallToken } from './recallService.js'

export type SpotifyOwner = { userId: number } | { deviceId: number }

export interface SpotifyRefreshResult {
  accessToken: string
  refreshToken: string | null
  expiresAt: Date
}

export type SpotifyRefreshFn = (refreshToken: string) => Promise<SpotifyRefreshResult>

const REFRESH_THRESHOLD_MS = 60_000

function ownerColumn(owner: SpotifyOwner) {
  return 'userId' in owner
    ? ({ column: 'user_id', id: owner.userId } as const)
    : ({ column: 'jukebox_device_id', id: owner.deviceId } as const)
}

export function createSpotifyConnectionService(
  db: Kysely<Database>,
  deps: { refresh?: SpotifyRefreshFn; now?: () => Date } = {},
) {
  const now = deps.now ?? (() => new Date())
  const refresh: SpotifyRefreshFn = (t) => {
    if (!deps.refresh) throw new Error('Spotify token refresh is not configured')
    return deps.refresh(t)
  }

  return {
    async upsert(
      owner: SpotifyOwner,
      data: { spotifyUserId: string; refreshToken: string; accessToken: string; expiresAt: Date; scopes: string },
    ): Promise<void> {
      const { column, id } = ownerColumn(owner)
      const values = {
        spotify_user_id: data.spotifyUserId,
        refresh_token: encryptRecallToken(data.refreshToken),
        access_token: encryptRecallToken(data.accessToken),
        access_token_expires_at: data.expiresAt,
        scopes: data.scopes,
      }
      await db
        .insertInto('spotify_connections')
        .values({ ...values, [column]: id })
        .onConflict(oc =>
          oc
            .column(column)
            .where(column, 'is not', null)
            .doUpdateSet({ ...values, updated_at: now().toISOString() }),
        )
        .execute()
    },

    async find(owner: SpotifyOwner): Promise<{ spotifyUserId: string; expiresAt: Date } | null> {
      const { column, id } = ownerColumn(owner)
      const row = await db
        .selectFrom('spotify_connections')
        .select(['spotify_user_id', 'access_token_expires_at'])
        .where(column, '=', id)
        .executeTakeFirst()
      return row ? { spotifyUserId: row.spotify_user_id, expiresAt: row.access_token_expires_at } : null
    },

    async remove(owner: SpotifyOwner): Promise<void> {
      const { column, id } = ownerColumn(owner)
      await db.deleteFrom('spotify_connections').where(column, '=', id).execute()
    },

    async getAccessToken(owner: SpotifyOwner): Promise<{ accessToken: string; expiresAt: Date } | null> {
      const { column, id } = ownerColumn(owner)
      const row = await db
        .selectFrom('spotify_connections')
        .selectAll()
        .where(column, '=', id)
        .executeTakeFirst()
      if (!row) return null

      if (row.access_token_expires_at.getTime() - now().getTime() > REFRESH_THRESHOLD_MS) {
        return { accessToken: decryptRecallToken(row.access_token), expiresAt: row.access_token_expires_at }
      }

      const currentRefresh = decryptRecallToken(row.refresh_token)
      const refreshed = await refresh(currentRefresh)
      await db
        .updateTable('spotify_connections')
        .set({
          access_token: encryptRecallToken(refreshed.accessToken),
          refresh_token: encryptRecallToken(refreshed.refreshToken ?? currentRefresh),
          access_token_expires_at: refreshed.expiresAt,
          updated_at: now().toISOString(),
        })
        .where('id', '=', row.id)
        .execute()
      return { accessToken: refreshed.accessToken, expiresAt: refreshed.expiresAt }
    },
  }
}

// Default instance. Task 2 wires the real refresh via setSpotifyRefresh to avoid an import cycle.
let wiredRefresh: SpotifyRefreshFn | undefined
export function setSpotifyRefresh(fn: SpotifyRefreshFn): void {
  wiredRefresh = fn
}

export const spotifyConnectionService = createSpotifyConnectionService(db, {
  refresh: (token) => {
    if (!wiredRefresh) throw new Error('Spotify token refresh is not configured')
    return wiredRefresh(token)
  },
})

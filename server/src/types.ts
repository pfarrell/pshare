// Type definitions for Hono context variables

export interface User {
  id: number
  username: string
  email: string | null
  admin: boolean
  default_profile_id: number | null
}

export type Variables = {
  user?: User
  // Set by authMiddleware when the JWT carries a deviceId claim for a
  // still-valid (non-revoked) jukebox device — see requireOwnJukeboxDevice.
  jukeboxDeviceId?: number
  // Set by utils/http.ts loadOwned(): the collection/playlist row the
  // current user is allowed to modify.
  owned?: Record<string, any>
}

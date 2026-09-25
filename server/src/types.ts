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
  // Set by utils/http.ts loadOwned(): the collection/playlist row the
  // current user is allowed to modify.
  owned?: Record<string, any>
}

// EXPERIMENTAL (issue #72): which P·Share users may connect Spotify.
// Read on every call (not cached) so changing the env var needs no code path to invalidate.
export function isSpotifyAllowedUser(userId: number | null | undefined): boolean {
  if (userId == null) return false
  const ids = (process.env.SPOTIFY_ALLOWED_USER_IDS ?? '')
    .split(',')
    .map(s => s.trim())
    .filter(Boolean)
  return ids.includes(String(userId))
}

// EXPERIMENTAL (issue #72): Spotify Authorization Code + PKCE helpers.
import { Spotify, generateState, generateCodeVerifier } from 'arctic'
import type { SpotifyRefreshResult } from './spotifyConnectionService.js'

export const SPOTIFY_SCOPES = [
  'streaming',
  'user-read-email',
  'user-read-private',
  'user-read-playback-state',
  'user-modify-playback-state',
]

// Lazy, like googleOAuthService: SPOTIFY_REDIRECT_BASE isn't set at build time.
function spotifyClient(): Spotify {
  const clientId = process.env.SPOTIFY_CLIENT_ID
  const clientSecret = process.env.SPOTIFY_CLIENT_SECRET
  const redirectBase = process.env.SPOTIFY_REDIRECT_BASE
  if (!clientId || !clientSecret || !redirectBase) {
    throw new Error('SPOTIFY_CLIENT_ID, SPOTIFY_CLIENT_SECRET, and SPOTIFY_REDIRECT_BASE must all be set')
  }
  return new Spotify(clientId, clientSecret, `${redirectBase}/auth/spotify/callback`)
}

export function createSpotifyAuthorization(): { url: string; state: string; codeVerifier: string } {
  const state = generateState()
  const codeVerifier = generateCodeVerifier()
  const url = spotifyClient().createAuthorizationURL(state, codeVerifier, SPOTIFY_SCOPES).toString()
  return { url, state, codeVerifier }
}

export async function exchangeSpotifyCode(
  code: string,
  codeVerifier: string,
): Promise<{ accessToken: string; refreshToken: string; expiresAt: Date }> {
  const tokens = await spotifyClient().validateAuthorizationCode(code, codeVerifier)
  return {
    accessToken: tokens.accessToken(),
    refreshToken: tokens.refreshToken(),
    expiresAt: tokens.accessTokenExpiresAt(),
  }
}

export async function refreshSpotifyToken(refreshToken: string): Promise<SpotifyRefreshResult> {
  const tokens = await spotifyClient().refreshAccessToken(refreshToken)
  return {
    accessToken: tokens.accessToken(),
    refreshToken: tokens.hasRefreshToken() ? tokens.refreshToken() : null,
    expiresAt: tokens.accessTokenExpiresAt(),
  }
}

export async function fetchSpotifyMe(accessToken: string): Promise<{ id: string; product: string }> {
  const res = await fetch('https://api.spotify.com/v1/me', {
    headers: { Authorization: `Bearer ${accessToken}` },
    signal: AbortSignal.timeout(5000),
  })
  if (!res.ok) throw new Error(`Spotify /me fetch failed: ${res.status}`)
  const body = (await res.json()) as { id?: string; product?: string }
  if (!body.id) throw new Error('Spotify /me returned no id')
  return { id: body.id, product: body.product ?? '' }
}

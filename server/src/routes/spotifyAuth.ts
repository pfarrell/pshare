// EXPERIMENTAL (issue #72): connect a Spotify Premium account to a user or a jukebox device.
import { Hono, Context } from 'hono'
import { getCookie, setCookie, deleteCookie } from 'hono/cookie'
import type { Variables } from '../types.js'
import { cookieOptionsForRequest } from './auth.js'
import { db } from '../db/database.js'
import { isSpotifyAllowedUser } from '../services/spotifyAccess.js'
import {
  createSpotifyAuthorization,
  exchangeSpotifyCode,
  fetchSpotifyMe,
  refreshSpotifyToken,
  SPOTIFY_SCOPES,
} from '../services/spotifyOAuth.js'
import { spotifyConnectionService, setSpotifyRefresh, type SpotifyOwner } from '../services/spotifyConnectionService.js'

// Import-time side effect: this module is always loaded by index.ts, so the
// default connection service can always refresh.
setSpotifyRefresh(refreshSpotifyToken)

const spotifyAuth = new Hono<{ Variables: Variables }>()

// Path '/' for the same nginx/Vite prefix-stripping reason as the Google flow.
const COOKIE_PATH = '/'
const COOKIE_NAMES = ['spotify_oauth_state', 'spotify_oauth_verifier', 'spotify_oauth_target']

type Ctx = Context<{ Variables: Variables }>

function clearCookies(c: Ctx) {
  const { domain } = cookieOptionsForRequest(c)
  for (const name of COOKIE_NAMES) deleteCookie(c, name, { path: COOKIE_PATH, domain })
}

// Resolves ?target=user|device&deviceId=N into an owner the user may act on.
async function resolveTarget(
  c: Ctx,
  userId: number,
  target: string | undefined,
  deviceIdRaw: string | undefined,
): Promise<{ owner: SpotifyOwner } | { status: 400 | 404 }> {
  if (target === 'user') return { owner: { userId } }
  if (target !== 'device') return { status: 400 }
  const deviceId = Number(deviceIdRaw)
  if (!Number.isInteger(deviceId)) return { status: 404 }
  const device = await db
    .selectFrom('jukebox_devices')
    .select(['id', 'user_id'])
    .where('id', '=', deviceId)
    .executeTakeFirst()
  if (!device || device.user_id !== userId) return { status: 404 }
  return { owner: { deviceId } }
}

spotifyAuth.get('/start', async (c) => {
  const user = c.get('user')
  if (!user || !isSpotifyAllowedUser(user.id)) return c.json({ error: 'Forbidden' }, 403)

  const target = c.req.query('target')
  const resolved = await resolveTarget(c, user.id, target, c.req.query('deviceId'))
  if ('status' in resolved) return c.json({ error: resolved.status === 400 ? 'Bad target' : 'Not found' }, resolved.status)

  const { url, state, codeVerifier } = createSpotifyAuthorization()
  const cookieOpts = {
    httpOnly: true,
    sameSite: 'Lax' as const,
    maxAge: 600,
    path: COOKIE_PATH,
    ...cookieOptionsForRequest(c),
  }
  setCookie(c, 'spotify_oauth_state', state, cookieOpts)
  setCookie(c, 'spotify_oauth_verifier', codeVerifier, cookieOpts)
  setCookie(c, 'spotify_oauth_target', 'deviceId' in resolved.owner ? `device:${resolved.owner.deviceId}` : 'user', cookieOpts)
  return c.redirect(url)
})

spotifyAuth.get('/callback', async (c) => {
  const spaBase = process.env.BEMUSED_PUBLIC_URL || 'http://localhost:5173'
  const done = (result: string) => {
    clearCookies(c)
    return c.redirect(`${spaBase}/account?spotify=${result}`)
  }

  const user = c.get('user')
  const code = c.req.query('code')
  const state = c.req.query('state')
  const storedState = getCookie(c, 'spotify_oauth_state')
  const codeVerifier = getCookie(c, 'spotify_oauth_verifier')
  const targetCookie = getCookie(c, 'spotify_oauth_target')

  if (!user || !isSpotifyAllowedUser(user.id) || !code || !state || !storedState || !codeVerifier || state !== storedState) {
    return done('failed')
  }

  try {
    // Re-check ownership: the target cookie is only trusted after validation.
    const resolved = targetCookie?.startsWith('device:')
      ? await resolveTarget(c, user.id, 'device', targetCookie.slice('device:'.length))
      : targetCookie === 'user'
        ? await resolveTarget(c, user.id, 'user', undefined)
        : { status: 400 as const }
    if ('status' in resolved) return done('failed')

    const tokens = await exchangeSpotifyCode(code, codeVerifier)
    const me = await fetchSpotifyMe(tokens.accessToken)
    if (me.product !== 'premium') return done('not_premium')

    await spotifyConnectionService.upsert(resolved.owner, {
      spotifyUserId: me.id,
      refreshToken: tokens.refreshToken,
      accessToken: tokens.accessToken,
      expiresAt: tokens.expiresAt,
      scopes: SPOTIFY_SCOPES.join(' '),
    })
    return done('connected')
  } catch (error) {
    console.error('Spotify OAuth callback failed:', error)
    return done('failed')
  }
})

// A device session's effective owner is the device itself; otherwise the user.
function effectiveOwner(c: Ctx, userId: number): SpotifyOwner {
  const deviceId = c.get('jukeboxDeviceId')
  return deviceId != null ? { deviceId } : { userId }
}

spotifyAuth.get('/token', async (c) => {
  const user = c.get('user')
  if (!user) return c.json({ error: 'Authentication required' }, 401)
  if (!isSpotifyAllowedUser(user.id)) return c.json({ error: 'Forbidden' }, 403)

  try {
    const token = await spotifyConnectionService.getAccessToken(effectiveOwner(c, user.id))
    if (!token) return c.json({ error: 'not_connected' }, 404)
    return c.json({ accessToken: token.accessToken, expiresAt: token.expiresAt.toISOString() })
  } catch (error) {
    // e.g. revoked refresh token: surface as "not connected" so the client fails silently.
    console.error('Spotify token fetch failed:', error)
    return c.json({ error: 'not_connected' }, 404)
  }
})

spotifyAuth.get('/status', async (c) => {
  const user = c.get('user')
  if (!user) return c.json({ error: 'Authentication required' }, 401)
  if (!isSpotifyAllowedUser(user.id)) return c.json({ allowed: false, connected: false, devices: [] })

  const connected = Boolean(await spotifyConnectionService.find(effectiveOwner(c, user.id)))
  if (c.get('jukeboxDeviceId') != null) return c.json({ allowed: true, connected, devices: [] })

  const rows = await db
    .selectFrom('jukebox_devices')
    .leftJoin('spotify_connections', 'spotify_connections.jukebox_device_id', 'jukebox_devices.id')
    .select(['jukebox_devices.id', 'jukebox_devices.name', 'spotify_connections.id as connection_id'])
    .where('jukebox_devices.user_id', '=', user.id)
    .orderBy('jukebox_devices.id')
    .execute()
  const devices = rows.map(r => ({ id: r.id, name: r.name, connected: r.connection_id != null }))
  return c.json({ allowed: true, connected, devices })
})

spotifyAuth.delete('/connection', async (c) => {
  const user = c.get('user')
  if (!user || !isSpotifyAllowedUser(user.id)) return c.json({ error: 'Forbidden' }, 403)

  const resolved = await resolveTarget(c, user.id, c.req.query('target'), c.req.query('deviceId'))
  if ('status' in resolved) return c.json({ error: resolved.status === 400 ? 'Bad target' : 'Not found' }, resolved.status)

  await spotifyConnectionService.remove(resolved.owner)
  return c.body(null, 204)
})

export default spotifyAuth

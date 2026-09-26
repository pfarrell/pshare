import { Context, Next } from 'hono'
import { getCookie } from 'hono/cookie'
import jwt from 'jsonwebtoken'
import { authService } from '../services/authService.js'
import { jukeboxDeviceService } from '../services/jukeboxDeviceService.js'
import type { Variables } from '../types.js'

const JWT_SECRET = process.env.BEMUSED_JWT_SECRET || 'default-secret-change-me'

interface JWTPayload {
  id: number
  username: string
  admin: boolean
  iat: number
  deviceId?: number
}

type AppContext = Context<{ Variables: Variables }>

// Middleware to extract and verify JWT from cookie
export async function authMiddleware(c: AppContext, next: Next) {
  const token = getCookie(c, 'auth')

  if (!token) {
    await next()
    return
  }

  let decoded: JWTPayload
  try {
    decoded = jwt.verify(token, JWT_SECRET, { algorithms: ['HS256'] }) as JWTPayload
  } catch {
    // Invalid or expired token — proceed without user
    await next()
    return
  }

  // DB errors propagate rather than silently clearing the user context
  const user = await authService.findUserById(decoded.id)

  // A password reset sets password_changed_at; any JWT issued before that
  // (decoded.iat is seconds since epoch, matching jsonwebtoken's own clock)
  // belongs to a session that predates the reset and must stop working —
  // this is what makes "invalidate other sessions" happen without a
  // server-side token blocklist.
  // Both sides are floored to whole seconds before comparing: iat is
  // second-precision per the JWT spec, but password_changed_at is a
  // millisecond-precision DB timestamp, so comparing them raw would falsely
  // reject a token issued the very same second as the reset (e.g. an
  // auto-login right after a reset, if one is ever added).
  const passwordChangedAfterToken =
    user?.password_changed_at != null &&
    Math.floor(new Date(user.password_changed_at).getTime() / 1000) > decoded.iat

  // Jukebox device tokens carry a deviceId claim; if that jukebox_devices
  // row has been deleted (manual revocation — see
  // docs/superpowers/specs/2026-09-20-jukebox-mode-design.md), the token is
  // treated as invalid even though its JWT signature/expiry still check out.
  let deviceRevoked = false
  if (decoded.deviceId != null) {
    const device = await jukeboxDeviceService.findById(decoded.deviceId)
    deviceRevoked = !device
  }

  if (user && !passwordChangedAfterToken && !deviceRevoked) {
    c.set('user', user)
  }

  if (user && !passwordChangedAfterToken && !deviceRevoked && decoded.deviceId != null) {
    c.set('jukeboxDeviceId', decoded.deviceId)
  }

  await next()
}

// Middleware to require authentication
export async function requireAuth(c: AppContext, next: Next) {
  const user = c.get('user')

  if (!user) {
    return c.json({ error: 'Authentication required' }, 401)
  }

  await next()
}

// Middleware to require admin privileges
export async function requireAdmin(c: AppContext, next: Next) {
  const user = c.get('user')

  if (!user) {
    return c.json({ error: 'Authentication required' }, 401)
  }

  if (!user.admin) {
    return c.json({ error: 'Admin privileges required' }, 403)
  }

  await next()
}

// Middleware to require that the request's own device JWT matches the
// route's :id param — one kiosk can never act on another device's queue,
// even one owned by the same account.
export async function requireOwnJukeboxDevice(c: AppContext, next: Next) {
  const deviceId = c.get('jukeboxDeviceId')
  const routeId = parseInt(c.req.param('id'))

  if (deviceId == null || deviceId !== routeId) {
    return c.json({ error: 'Not this device' }, 403)
  }

  await next()
}

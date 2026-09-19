import { Hono } from 'hono'
import type { Context } from 'hono'
import bcrypt from 'bcrypt'
import jwt from 'jsonwebtoken'
import crypto from 'crypto'
import { setCookie, getCookie, deleteCookie } from 'hono/cookie'
import type { Variables } from '../types.js'
import { requireAuth } from '../middleware/auth.js'
import { authService } from '../services/authService.js'
import { signupLogService } from '../services/signupLogService.js'
import { sendPasswordResetEmail } from '../services/emailService.js'
import { isLanHost } from '../db/streamUrl.js'
import { recallAuthUrl, signRecallState, verifyRecallState, encryptRecallToken } from '../services/recallService.js'
import { notesService } from '../services/notesService.js'
import { safeReturnTo } from '../utils/returnTo.js'
import {
  createAuthorization,
  exchangeCode,
  fetchGoogleProfile,
  decideOAuthAction,
  getIdentity,
  getIdentityForUser,
  createIdentity,
  deleteIdentity,
} from '../services/googleOAuthService.js'

const auth = new Hono<{ Variables: Variables }>()

const JWT_SECRET = process.env.BEMUSED_JWT_SECRET || 'default-secret-change-me'
const JWT_EXPIRES_IN = '14d'
const SALT_ROUNDS = 10

// Helper to generate JWT token
function generateToken(userId: number, username: string, admin: boolean): string {
  return jwt.sign(
    { id: userId, username, admin },
    JWT_SECRET,
    { expiresIn: JWT_EXPIRES_IN }
  )
}

// Cookie scoping differs by which host the request came in on (nginx passes the
// real Host through unchanged). The LAN IP gets a host-only, non-Secure cookie
// since it's plain HTTP; patf.com keeps the existing Secure, domain-scoped cookie.
// The two are independent sessions by design — see
// docs/superpowers/specs/2026-07-03-lan-access-design.md.
function cookieOptionsForRequest(c: Context): { secure: boolean; domain: string | undefined } {
  if (process.env.NODE_ENV !== 'production') {
    return { secure: false, domain: undefined }
  }
  const isLan = isLanHost(c)
  return {
    secure: !isLan,
    domain: isLan ? undefined : '.patf.com',
  }
}

// Path must be '/', not a sub-path like '/auth/google': both nginx
// (`rewrite ^/pshare/api/(.*) /$1 break`) and the Vite dev proxy strip the
// /api prefix before the request reaches this Hono app, so the backend
// never sees the same path the *browser* used to set the cookie. A
// Path=/auth/google cookie set in response to a browser request for
// /pshare/api/auth/google/start would never be sent back on
// /pshare/api/auth/google/callback, since that's the path the browser
// compares against, not whatever path Hono thinks it's routing internally.
// The existing `auth` cookie already sidesteps this the same way (path: '/').
const GOOGLE_OAUTH_COOKIE_PATH = '/'

function clearGoogleOAuthCookies(c: Context, domain: string | undefined) {
  for (const name of ['google_oauth_state', 'google_oauth_verifier', 'google_oauth_from', 'google_oauth_intent']) {
    deleteCookie(c, name, { path: GOOGLE_OAUTH_COOKIE_PATH, domain })
  }
}

type AuthUser = { id: number; username: string; email: string | null; admin: boolean; default_tag: string | null }

async function buildUserPayload(user: AuthUser) {
  const [recallConnection, googleIdentity, hasPassword] = await Promise.all([
    notesService.getConnection(user.id),
    getIdentityForUser(user.id, 'google'),
    authService.hasPassword(user.id),
  ])
  return {
    id: user.id,
    username: user.username,
    email: user.email,
    admin: user.admin,
    default_tag: user.default_tag ?? null,
    recall_connected: Boolean(recallConnection),
    google_connected: Boolean(googleIdentity),
    has_password: hasPassword,
  }
}

// GET /auth/google/start — kick off the PKCE flow, redirect to Google
auth.get('/google/start', async (c) => {
  const { url, state, codeVerifier } = createAuthorization()

  const returnTo = safeReturnTo(c.req.query('return_to'))

  const cookieOpts = {
    httpOnly: true,
    sameSite: 'Lax' as const,
    maxAge: 600, // 10 minutes
    path: GOOGLE_OAUTH_COOKIE_PATH,
    ...cookieOptionsForRequest(c),
  }
  setCookie(c, 'google_oauth_state', state, cookieOpts)
  setCookie(c, 'google_oauth_verifier', codeVerifier, cookieOpts)
  if (returnTo) setCookie(c, 'google_oauth_from', returnTo, cookieOpts)

  // Linking Google to an existing session requires *explicit* intent, set only
  // by the Account page's "Connect Google Account" link. Without this, any
  // "Continue with Google" click on /login in a browser where someone else is
  // still signed in would silently link the new Google account to that session's
  // user (same-device session hijack).
  const intentRaw = c.req.query('intent')
  if (intentRaw === 'link') setCookie(c, 'google_oauth_intent', 'link', cookieOpts)

  return c.redirect(url)
})

// GET /auth/google/callback — validate the code, apply the login/signup/link decision
auth.get('/google/callback', async (c) => {
  const { domain } = cookieOptionsForRequest(c)
  const spaBase = process.env.BEMUSED_PUBLIC_URL || 'http://localhost:5173'

  // Google sends ?error=access_denied (and no code/state) when the user declines
  // consent. Only this one value is allowlisted for its own message — anything
  // else falls through to the generic google_failed path below.
  const providerError = c.req.query('error')
  if (providerError === 'access_denied') {
    clearGoogleOAuthCookies(c, domain)
    return c.redirect(`${spaBase}/login?error=access_denied`)
  }

  const code = c.req.query('code')
  const state = c.req.query('state')
  const storedState = getCookie(c, 'google_oauth_state')
  const codeVerifier = getCookie(c, 'google_oauth_verifier')
  // Re-validated here (not just trusted from /google/start) since it's about
  // to be resolved against the bare origin below — defense in depth against
  // a hand-crafted cookie value bypassing browser JS but not a raw request.
  const returnTo = safeReturnTo(getCookie(c, 'google_oauth_from'))
  const intent = getCookie(c, 'google_oauth_intent')

  if (!code || !state || !storedState || !codeVerifier || state !== storedState) {
    clearGoogleOAuthCookies(c, domain)
    return c.redirect(`${spaBase}/login?error=google_failed`)
  }

  let profile
  try {
    const accessToken = await exchangeCode(code, codeVerifier)
    profile = await fetchGoogleProfile(accessToken)
  } catch (error) {
    console.error('Google OAuth exchange failed:', error)
    clearGoogleOAuthCookies(c, domain)
    return c.redirect(`${spaBase}/login?error=google_failed`)
  }

  if (!profile.email_verified) {
    clearGoogleOAuthCookies(c, domain)
    return c.redirect(`${spaBase}/login?error=google_email_unverified`)
  }

  const currentUser = c.get('user')
  const identity = await getIdentity('google', profile.sub)
  // Only an explicitly link-intended flow may act on the current session; a
  // sign-in started from /login or /signup always resolves to login/signup
  // regardless of whatever session cookie happens to be present.
  const sessionUserId = intent === 'link' ? (currentUser?.id ?? null) : null
  const decision = decideOAuthAction(sessionUserId, identity?.user_id ?? null)

  let redirectPath = returnTo || '/'
  // Tracks whether redirectPath is still the caller-supplied return_to (as
  // opposed to a fixed internal destination the switch below chose), so the
  // final redirect knows which base to resolve it against. Deliberately not
  // inferred by comparing redirectPath === returnTo — a return_to of exactly
  // '/account' or '/' would coincidentally equal a hardcoded internal
  // destination below and get misattributed as external.
  let redirectIsReturnTo = Boolean(returnTo)
  let loggedInUser: { id: number; username: string; admin: boolean } | undefined

  switch (decision.kind) {
    case 'login': {
      const found = await authService.findUserById(decision.userId)
      if (!found) {
        clearGoogleOAuthCookies(c, domain)
        return c.redirect(`${spaBase}/login?error=google_failed`)
      }
      loggedInUser = found
      break
    }
    case 'signup': {
      // users.email has no uniqueness constraint, so without this check a Google
      // signup for an email that already belongs to a password account would
      // silently create an unmergeable duplicate.
      const existingByEmail = await authService.findUserByEmail(profile.email)
      if (existingByEmail) {
        clearGoogleOAuthCookies(c, domain)
        return c.redirect(`${spaBase}/login?error=google_email_in_use`)
      }
      const created = await authService.createUserFromGoogle({ email: profile.email })
      if (!created) {
        clearGoogleOAuthCookies(c, domain)
        return c.redirect(`${spaBase}/login?error=google_failed`)
      }
      await createIdentity({ provider: 'google', providerUserId: profile.sub, userId: created.id, email: profile.email })
      console.log(`[signup] new account created via Google: ${created.username} (${profile.email})`)
      await signupLogService.record({ username: created.username, email: profile.email, method: 'google' })
      loggedInUser = created
      break
    }
    case 'link': {
      await createIdentity({ provider: 'google', providerUserId: profile.sub, userId: decision.userId, email: profile.email })
      redirectPath = '/account?linked=google'
      redirectIsReturnTo = false
      break
    }
    case 'link-noop':
      redirectPath = '/account'
      redirectIsReturnTo = false
      break
    case 'link-conflict':
      clearGoogleOAuthCookies(c, domain)
      return c.redirect(`${spaBase}/account?error=google_already_linked`)
  }

  if (loggedInUser) {
    const token = generateToken(loggedInUser.id, loggedInUser.username, loggedInUser.admin)
    setCookie(c, 'auth', token, {
      httpOnly: true,
      sameSite: 'Lax',
      maxAge: 86400 * 14,
      path: '/',
      ...cookieOptionsForRequest(c),
    })
  }

  clearGoogleOAuthCookies(c, domain)

  // redirectIsReturnTo distinguishes the caller-supplied return_to from a
  // fixed internal destination the switch above chose ('/', '/account',
  // '/account?linked=google'). The two need different bases: internal
  // destinations resolve under spaBase (which already includes the SPA's own
  // path prefix, e.g. /pshare/app), but return_to is origin-relative
  // (matching src/utils/returnTo.js's contract, since it can point at an
  // external caller's own path, e.g. /overtone/entity/123) and must resolve
  // against the bare origin instead — concatenating it onto spaBase's path
  // prefix would 404 for an external target.
  let redirectOrigin = spaBase
  if (redirectIsReturnTo) {
    try {
      redirectOrigin = new URL(spaBase).origin
    } catch {
      // BEMUSED_PUBLIC_URL is operator-set, not attacker-controlled, but a
      // misconfigured value (missing scheme, etc.) shouldn't 500 the login
      // flow — fall back to the SPA-relative behavior instead.
      redirectOrigin = spaBase
    }
  }
  return c.redirect(`${redirectOrigin}${redirectPath}`)
})

// POST /auth/signup - Public: create a new account and log the caller in.
auth.post('/signup', async (c) => {
  try {
    const body = await c.req.json()
    const { username, password, email } = body

    // Validation
    if (!username || !password) {
      return c.json({ error: 'Username and password are required' }, 400)
    }

    if (username.length < 3) {
      return c.json({ error: 'Username must be at least 3 characters' }, 400)
    }

    if (password.length < 6) {
      return c.json({ error: 'Password must be at least 6 characters' }, 400)
    }

    // Check if username already exists (case-insensitive)
    const existingUser = await authService.userExistsByUsername(username)

    if (existingUser) {
      return c.json({ error: 'Username already taken' }, 409)
    }

    // Hash password
    const passwordHash = await bcrypt.hash(password, SALT_ROUNDS)

    // Create user (store username as entered)
    const user = await authService.createUser({
      username,
      password: passwordHash,
      email: email || null,
    })

    if (!user) {
      return c.json({ error: 'Failed to create user' }, 500)
    }

    console.log(`[signup] new account created via password: ${user.username}${email ? ` (${email})` : ''}`)
    await signupLogService.record({ username: user.username, email: email || null, method: 'password' })

    const token = generateToken(user.id, user.username, user.admin)
    setCookie(c, 'auth', token, {
      httpOnly: true,
      sameSite: 'Lax',
      maxAge: 86400 * 14,
      path: '/',
      ...cookieOptionsForRequest(c),
    })

    return c.json({ user: await buildUserPayload(user) })
  } catch (error: any) {
    console.error('Signup error:', error)
    return c.json({ error: 'Failed to create account' }, 500)
  }
})

// POST /auth/login - Authenticate user
auth.post('/login', async (c) => {
  try {
    const body = await c.req.json()
    const { username, password } = body

    // Validation
    if (!username || !password) {
      return c.json({ error: 'Username and password are required' }, 400)
    }

    // Find user (case-insensitive username)
    const user = await authService.findUserForLogin(username)

    // A Google-only account has password === null; bcrypt.compare throws on a
    // null hash, so it must be treated as a failed login (same response, so we
    // don't leak that the account exists without a password).
    if (!user || !user.password) {
      return c.json({ error: 'Invalid username or password' }, 401)
    }

    // Verify password
    const passwordMatch = await bcrypt.compare(password, user.password)

    if (!passwordMatch) {
      return c.json({ error: 'Invalid username or password' }, 401)
    }

    // Generate JWT token
    const token = generateToken(user.id, user.username, user.admin)

    // Set httpOnly cookie
    // Path must be '/' so cookie is sent to both /pshare/api and /pshare/app
    setCookie(c, 'auth', token, {
      httpOnly: true,
      sameSite: 'Lax',
      maxAge: 86400 * 14, // 2 weeks
      path: '/',
      ...cookieOptionsForRequest(c),
    })

    // Return user data (without password)
    return c.json({ user: await buildUserPayload(user) })
  } catch (error: any) {
    console.error('Login error:', error)
    return c.json({ error: 'Authentication failed' }, 500)
  }
})

// POST /auth/logout - Clear auth cookie
auth.post('/logout', async (c) => {
  // Must match the domain the cookie was set with, or the browser won't clear it.
  const { domain } = cookieOptionsForRequest(c)
  deleteCookie(c, 'auth', {
    path: '/',
    domain,
  })

  return c.json({ message: 'Logged out successfully' })
})

// GET /auth/me - Get current user info
auth.get('/me', async (c) => {
  try {
    // Get user from context (set by auth middleware)
    const user = c.get('user')

    if (!user) {
      return c.json({ error: 'Not authenticated' }, 401)
    }

    return c.json({ user: await buildUserPayload(user) })
  } catch (error: any) {
    console.error('Get user error:', error)
    return c.json({ error: 'Failed to get user info' }, 500)
  }
})

// PUT /auth/default-tag — save a default tag for the current user
auth.put('/default-tag', requireAuth, async (c) => {
  const user = c.get('user')!

  const body = await c.req.json()
  const raw = body.tag ?? null
  const tag = raw
    ? raw.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || null
    : null

  await authService.updateDefaultTag(user.id, tag)

  return c.json({ default_tag: tag })
})

// GET /auth/recall/connect — redirect to Recall's authorize page
auth.get('/recall/connect', requireAuth, async (c) => {
  const user = c.get('user')!

  const callbackUrl = process.env.RECALL_CALLBACK_URL
  if (!callbackUrl) return c.json({ error: 'RECALL_CALLBACK_URL not configured' }, 500)

  const returnToRaw = c.req.query('return_to') ?? '/library'
  const returnTo = returnToRaw.startsWith('/') && !returnToRaw.startsWith('//') ? returnToRaw : '/library'

  const state = signRecallState(user.id, returnTo)
  return c.redirect(recallAuthUrl(callbackUrl, state))
})

// GET /auth/recall/callback — completes the Recall handshake, stores the encrypted token
auth.get('/recall/callback', async (c) => {
  const user = c.get('user')
  if (!user) {
    const loginBase = process.env.NODE_ENV === 'production' ? 'https://patf.com/pshare/app' : 'http://localhost:5173'
    return c.redirect(`${loginBase}/login`)
  }

  const token = c.req.query('token')
  const state = c.req.query('state')
  if (!token || !state) return c.json({ error: 'Missing token or state' }, 400)

  let parsed: { userId: number; returnTo: string }
  try {
    parsed = verifyRecallState(state)
  } catch {
    return c.json({ error: 'Invalid or expired state' }, 400)
  }

  if (parsed.userId !== user.id) {
    return c.json({ error: 'State does not match current session' }, 400)
  }

  await notesService.saveConnection(user.id, encryptRecallToken(token))

  const redirectBase = process.env.NODE_ENV === 'production' ? 'https://patf.com/pshare/app' : 'http://localhost:5173'
  const separator = parsed.returnTo.includes('?') ? '&' : '?'
  return c.redirect(`${redirectBase}${parsed.returnTo}${separator}linked=recall`)
})

// DELETE /auth/recall/connect — disconnect locally; does not revoke the token on Recall's side
auth.delete('/recall/connect', requireAuth, async (c) => {
  const user = c.get('user')!

  await notesService.deleteConnection(user.id)
  return c.json({ ok: true })
})

// PUT /auth/set-password — for accounts created via Google with no password yet
auth.put('/set-password', requireAuth, async (c) => {
  const user = c.get('user')!

  const body = await c.req.json()
  const { password } = body
  if (!password || password.length < 6) {
    return c.json({ error: 'Password must be at least 6 characters' }, 400)
  }

  if (await authService.hasPassword(user.id)) {
    return c.json({ error: 'Password already set' }, 400)
  }

  const passwordHash = await bcrypt.hash(password, SALT_ROUNDS)
  await authService.setPassword(user.id, passwordHash)
  return c.json({ ok: true })
})

// PUT /auth/change-password — for accounts that already have a password
auth.put('/change-password', requireAuth, async (c) => {
  const user = c.get('user')!

  const body = await c.req.json()
  const { currentPassword, newPassword } = body

  if (!currentPassword || !newPassword) {
    return c.json({ error: 'Current and new password are required' }, 400)
  }

  if (newPassword.length < 6) {
    return c.json({ error: 'New password must be at least 6 characters' }, 400)
  }

  const currentHash = await authService.getPasswordHash(user.id)
  if (!currentHash) {
    return c.json({ error: 'No password set for this account' }, 400)
  }

  const passwordMatch = await bcrypt.compare(currentPassword, currentHash)
  if (!passwordMatch) {
    return c.json({ error: 'Current password is incorrect' }, 400)
  }

  const passwordHash = await bcrypt.hash(newPassword, SALT_ROUNDS)
  await authService.setPassword(user.id, passwordHash)
  return c.json({ ok: true })
})

const RESET_TOKEN_TTL_MS = 3 * 24 * 60 * 60 * 1000
const RESET_TOKEN_RATE_LIMIT = 3
const RESET_TOKEN_RATE_WINDOW_MS = 60 * 60 * 1000

function hashResetToken(rawToken: string): string {
  return crypto.createHash('sha256').update(rawToken).digest('hex')
}

// POST /auth/forgot-password — public. Always returns the same generic
// message regardless of whether the username exists, has an email, or is
// rate-limited — this endpoint must never let a caller distinguish those
// cases from the response (see spec: docs/superpowers/specs/2026-09-10-forgot-password-flow-design.md).
auth.post('/forgot-password', async (c) => {
  const GENERIC_RESPONSE = { message: 'If an account with that username has an email on file, a reset link has been sent.' }

  try {
    const body = await c.req.json()
    const { username } = body
    if (!username) return c.json(GENERIC_RESPONSE)

    const user = await authService.findUserForLogin(username)
    if (!user || !user.email) return c.json(GENERIC_RESPONSE)

    const since = new Date(Date.now() - RESET_TOKEN_RATE_WINDOW_MS)
    const recentCount = await authService.countRecentPasswordResetTokens(user.id, since)
    if (recentCount >= RESET_TOKEN_RATE_LIMIT) return c.json(GENERIC_RESPONSE)

    const rawToken = crypto.randomBytes(32).toString('base64url')
    const tokenHash = hashResetToken(rawToken)
    const expiresAt = new Date(Date.now() + RESET_TOKEN_TTL_MS)

    await authService.invalidateUnusedPasswordResetTokensForUser(user.id)
    await authService.createPasswordResetToken(user.id, tokenHash, expiresAt)

    const publicUrl = process.env.BEMUSED_PUBLIC_URL || 'http://localhost:5173'
    const resetUrl = `${publicUrl}/reset-password/${rawToken}`
    // Fire-and-forget: sendPasswordResetEmail never throws (failures are
    // logged internally via errorLogService), and awaiting a real Resend API
    // call here would make responses for existing usernames measurably
    // slower than for unknown ones — a timing side-channel that would defeat
    // this endpoint's "never reveal account existence" guarantee even though
    // the response body stays identical.
    void sendPasswordResetEmail(user.email, resetUrl)

    return c.json(GENERIC_RESPONSE)
  } catch (error: any) {
    console.error('Forgot-password error:', error)
    return c.json(GENERIC_RESPONSE)
  }
})

// GET /auth/reset-password/validate?token=... — public. Reveals only
// whether the token is currently usable, never which account it belongs to.
auth.get('/reset-password/validate', async (c) => {
  const token = c.req.query('token')
  if (!token) return c.json({ valid: false })

  const found = await authService.findValidPasswordResetToken(hashResetToken(token))
  return c.json({ valid: Boolean(found) })
})

// POST /auth/reset-password — public. { token, newPassword }
auth.post('/reset-password', async (c) => {
  try {
    const body = await c.req.json()
    const { token, newPassword } = body

    if (!token || !newPassword) {
      return c.json({ error: 'Token and new password are required' }, 400)
    }
    if (newPassword.length < 6) {
      return c.json({ error: 'New password must be at least 6 characters' }, 400)
    }

    const found = await authService.findValidPasswordResetToken(hashResetToken(token))
    if (!found) {
      return c.json({ error: 'This reset link is invalid or has expired' }, 400)
    }

    const passwordHash = await bcrypt.hash(newPassword, SALT_ROUNDS)
    await authService.completePasswordReset(found.id, found.user_id, passwordHash)

    return c.json({ ok: true })
  } catch (error: any) {
    console.error('Reset-password error:', error)
    return c.json({ error: 'Failed to reset password' }, 500)
  }
})

// DELETE /auth/google/disconnect — unlink Google; blocked if it would lock the user out
auth.delete('/google/disconnect', requireAuth, async (c) => {
  const user = c.get('user')!

  const hasPassword = await authService.hasPassword(user.id)
  if (!hasPassword) {
    return c.json({ error: 'Set a password before disconnecting Google' }, 400)
  }

  const identity = await getIdentityForUser(user.id, 'google')
  if (!identity) return c.json({ error: 'No Google account connected' }, 400)

  await deleteIdentity(user.id, 'google')
  return c.json({ ok: true })
})

export default auth

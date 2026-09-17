import { Hono } from 'hono'
import { signupLogService } from '../services/signupLogService.js'
import { paginate } from '../utils/http.js'

const signups = new Hono()

// GET /admin/signups?page=1&limit=25
signups.get('/', async (c) => {
  const { items, pagination } = await paginate(c, {
    count: () => signupLogService.countAll(),
    listPage: (limit, offset) => signupLogService.listPage(limit, offset),
  })
  return c.json({ signups: items, pagination })
})

// GET /admin/signups/unseen-count — powers the badge on the Admin nav link.
// Registered before any /:id-shaped route so it can never be misrouted there.
signups.get('/unseen-count', async (c) => {
  const count = await signupLogService.countUnseen()
  return c.json({ count })
})

// POST /admin/signups/seen — marks every unseen row seen. Called when the
// admin opens the signups list, clearing the badge.
signups.post('/seen', async (c) => {
  await signupLogService.markAllSeen()
  return c.json({ success: true })
})

export default signups

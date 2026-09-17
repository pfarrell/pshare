// server/src/utils/http.ts
import type { Context } from 'hono'
import { createMiddleware } from 'hono/factory'
import { db } from '../db/database.js'
import type { Variables } from '../types.js'
import { canModify } from './ownership.js'

export function parseIntParam(value: string | undefined): number | null {
  return value !== undefined && /^\d+$/.test(value) ? Number(value) : null
}

type OwnedTable = 'collections' | 'playlists'
type FindOwned = (table: OwnedTable, id: number) => Promise<{ user_id: number | null } | undefined>

const findOwned: FindOwned = (table, id) =>
  db.selectFrom(table).selectAll().where('id', '=', id).executeTakeFirst()

// Loads a user-owned row by URL param and enforces owner-or-admin. Handlers
// read it with c.get('owned').
export const loadOwned = (table: OwnedTable, param = 'id', find: FindOwned = findOwned) =>
  createMiddleware<{ Variables: Variables }>(async (c, next) => {
    const id = parseIntParam(c.req.param(param))
    if (id === null) return c.json({ error: `Invalid ${param}` }, 400)
    const row = await find(table, id)
    if (!row) return c.json({ error: 'Not found' }, 404)
    if (!canModify(c.get('user'), row)) return c.json({ error: 'Not permitted' }, 403)
    c.set('owned', row)
    await next()
  })

export async function paginate<T>(
  c: Context,
  { count, listPage }: { count: () => Promise<number>; listPage: (limit: number, offset: number) => Promise<T[]> }
) {
  const page = Math.max(1, parseInt(c.req.query('page') ?? '1') || 1)
  const limit = Math.max(1, parseInt(c.req.query('limit') ?? '25') || 1)
  const offset = (page - 1) * limit
  const [total, items] = await Promise.all([count(), listPage(limit, offset)])
  return { items, pagination: { page, limit, total, totalPages: Math.ceil(total / limit) } }
}

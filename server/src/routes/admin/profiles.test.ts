import 'dotenv/config'
import { test, after } from 'node:test'
import assert from 'node:assert/strict'
import { Hono } from 'hono'
import adminProfiles from './profiles.js'
import { requireAdmin } from '../../middleware/auth.js'
import { createTag, createProfile, createUser, cleanupFixtures } from '../../test/fixtures.js'
import { db } from '../../db/database.js'

after(cleanupFixtures)

const appWithUser = (user: any = { id: 1, admin: true }) => {
  const app = new Hono()
  app.use('*', async (c, next) => { if (user) c.set('user' as never, user as never); await next() })
  app.use('*', requireAdmin)
  app.route('/', adminProfiles)
  return app
}

const postJson = (app: Hono, path: string, body: unknown) =>
  app.request(path, { method: 'POST', body: JSON.stringify(body), headers: { 'Content-Type': 'application/json' } })
const putJson = (app: Hono, path: string, body: unknown) =>
  app.request(path, { method: 'PUT', body: JSON.stringify(body), headers: { 'Content-Type': 'application/json' } })

test('POST /admin/profiles requires admin', async () => {
  const res = await postJson(appWithUser({ id: 1, admin: false }), '/profiles', { name: 'x', tag_ids: [1] })
  assert.equal(res.status, 403)
})

test('POST /admin/profiles creates a profile with tags', async () => {
  const tag = await createTag('admin-create-tag')
  const res = await postJson(appWithUser(), '/profiles', { name: '__dry_test_admin_create_profile', tag_ids: [tag.id] })

  assert.equal(res.status, 201)
  const body = await res.json()
  assert.equal(body.name, '__dry_test_admin_create_profile')

  const links = await db.selectFrom('profile_tags').selectAll().where('profile_id', '=', body.id).execute()
  assert.deepEqual(links.map((l) => l.tag_id), [tag.id])
})

test('POST /admin/profiles rejects an empty name', async () => {
  const tag = await createTag('admin-emptyname-tag')
  const res = await postJson(appWithUser(), '/profiles', { name: '  ', tag_ids: [tag.id] })
  assert.equal(res.status, 400)
})

test('POST /admin/profiles rejects an empty tag_ids array', async () => {
  const res = await postJson(appWithUser(), '/profiles', { name: '__dry_test_admin_empty_tags', tag_ids: [] })
  assert.equal(res.status, 400)
})

test('POST /admin/profiles rejects a duplicate name', async () => {
  const existing = await createProfile('admin-dupe-profile', [])
  const res = await postJson(appWithUser(), '/profiles', { name: existing.name, tag_ids: [(await createTag('admin-dupe-tag')).id] })
  assert.equal(res.status, 409)
})

test('PUT /admin/profiles/:id renames and replaces the tag set', async () => {
  const tagA = await createTag('admin-put-tag-a')
  const tagB = await createTag('admin-put-tag-b')
  const profile = await createProfile('admin-put-profile', [tagA.id])

  const res = await putJson(appWithUser(), `/profiles/${profile.id}`, { name: '__dry_test_admin_put_renamed', tag_ids: [tagB.id] })

  assert.equal(res.status, 200)
  const links = await db.selectFrom('profile_tags').selectAll().where('profile_id', '=', profile.id).execute()
  assert.deepEqual(links.map((l) => l.tag_id), [tagB.id])
})

test('PUT /admin/profiles/:id returns 404 for a nonexistent profile', async () => {
  const res = await putJson(appWithUser(), '/profiles/999999999', { name: 'x', tag_ids: [(await createTag('admin-put-404-tag')).id] })
  assert.equal(res.status, 404)
})

test('DELETE /admin/profiles/:id deletes the profile and clears any default_profile_id pointing at it', async () => {
  const profile = await createProfile('admin-delete-profile', [])
  const user = await createUser('admin-delete-user')
  await db.updateTable('users').set({ default_profile_id: profile.id }).where('id', '=', user.id).execute()

  const res = await appWithUser().request(`/profiles/${profile.id}`, { method: 'DELETE' })

  assert.equal(res.status, 200)
  const reloadedUser = await db.selectFrom('users').select('default_profile_id').where('id', '=', user.id).executeTakeFirst()
  assert.equal(reloadedUser?.default_profile_id, null)
})

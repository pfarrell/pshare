// server/src/routes/notesRoutes.test.ts
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { Hono } from 'hono'
import { createNotesRoutes } from './notesRoutes.js'

const makeApp = ({ user = { id: 1, admin: false } as any, note = null as any, connection = { recall_token: 'enc' } as any, title = 'Abbey Road — The Beatles' as string | null } = {}) => {
  const calls: Record<string, unknown[]> = { createNote: [], deleteNote: [], createRecallNote: [] }
  const deps = {
    notesService: {
      getConnection: async () => connection,
      createNote: async (...args: unknown[]) => { calls.createNote.push(args); return { id: 77 } },
      findNoteById: async () => note,
      deleteNote: async (...args: unknown[]) => { calls.deleteNote.push(args) },
    },
    createRecallNote: async (_token: string, payload: unknown) => { calls.createRecallNote.push(payload); return { id: 'recall-1' } },
    decryptRecallToken: () => 'token',
    appendBacklink: (content: string, pathname: string) => `${content}\n${pathname}`,
  }
  const app = new Hono()
  app.use('*', async (c, next) => { if (user) c.set('user' as never, user as never); await next() })
  app.route('/album', createNotesRoutes({ kind: 'album', loadEntityTitle: async () => title, deps: deps as any }))
  return { app, calls }
}

const post = (app: Hono, path: string, body: unknown) =>
  app.request(path, { method: 'POST', body: JSON.stringify(body), headers: { 'Content-Type': 'application/json' } })

test('POST requires auth, a Recall connection, content, and an existing entity', async () => {
  assert.equal((await post(makeApp({ user: null }).app, '/album/5/notes', { content: 'x' })).status, 401)
  assert.equal((await post(makeApp({ connection: null }).app, '/album/5/notes', { content: 'x' })).status, 403)
  assert.equal((await post(makeApp().app, '/album/5/notes', { content: '  ' })).status, 400)
  const missing = await post(makeApp({ title: null }).app, '/album/5/notes', { content: 'x' })
  assert.equal(missing.status, 404)
  assert.deepEqual(await missing.json(), { error: 'Album not found' })
})

test('POST creates the Recall note with the entity title and links it', async () => {
  const { app, calls } = makeApp()
  const res = await post(app, '/album/5/notes', { content: ' great ' })
  assert.equal(res.status, 201)
  assert.deepEqual(await res.json(), { id: 77, recall_item_id: 'recall-1' })
  assert.deepEqual(calls.createRecallNote[0], { title: 'Abbey Road — The Beatles', contentText: 'great\n/album/5', tags: ['bemused'] })
  assert.deepEqual(calls.createNote[0], ['album', 5, 1, 'recall-1'])
})

test('DELETE lets the author or an admin unlink a matching note', async () => {
  const note = { id: 9, kind: 'album', target_id: 5, author_user_id: 1 }
  const { app, calls } = makeApp({ note })
  assert.equal((await app.request('/album/5/notes/9', { method: 'DELETE' })).status, 200)
  assert.deepEqual(calls.deleteNote[0], [9])
  assert.equal((await makeApp({ note, user: { id: 2, admin: false } }).app.request('/album/5/notes/9', { method: 'DELETE' })).status, 403)
  assert.equal((await makeApp({ note, user: { id: 2, admin: true } }).app.request('/album/5/notes/9', { method: 'DELETE' })).status, 200)
})

test('regression: DELETE 404s when the note belongs to a different entity', async () => {
  for (const note of [
    { id: 9, kind: 'track', target_id: 5, author_user_id: 1 },
    { id: 9, kind: 'album', target_id: 6, author_user_id: 1 },
  ]) {
    const { app, calls } = makeApp({ note })
    assert.equal((await app.request('/album/5/notes/9', { method: 'DELETE' })).status, 404)
    assert.equal(calls.deleteNote.length, 0)
  }
})

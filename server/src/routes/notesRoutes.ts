// server/src/routes/notesRoutes.ts
import { Hono } from 'hono'
import type { Variables } from '../types.js'
import { requireAuth } from '../middleware/auth.js'
import { notesService as defaultNotesService } from '../services/notesService.js'
import {
  createRecallNote as defaultCreateRecallNote,
  decryptRecallToken as defaultDecryptRecallToken,
  appendBacklink as defaultAppendBacklink,
} from '../services/recallService.js'

type NotesKind = 'album' | 'collection' | 'track'

const defaultDeps = {
  notesService: defaultNotesService,
  createRecallNote: defaultCreateRecallNote,
  decryptRecallToken: defaultDecryptRecallToken,
  appendBacklink: defaultAppendBacklink,
}

// POST /:id/notes and DELETE /:id/notes/:noteId for a notes-capable entity.
// Mount on that entity's router, e.g. albums.route('/', createNotesRoutes(...)).
export function createNotesRoutes({
  kind,
  loadEntityTitle,
  deps = defaultDeps,
}: {
  kind: NotesKind
  loadEntityTitle: (id: number) => Promise<string | null>
  deps?: typeof defaultDeps
}) {
  const router = new Hono<{ Variables: Variables }>()
  const notFound = `${kind[0].toUpperCase()}${kind.slice(1)} not found`

  // Requires a connected Recall account; creates a new journal-style note.
  router.post('/:id/notes', requireAuth, async (c) => {
    const user = c.get('user')!
    const targetId = parseInt(c.req.param('id'))

    const connection = await deps.notesService.getConnection(user.id)
    if (!connection) return c.json({ error: 'Recall not connected' }, 403)

    const body = await c.req.json()
    const content = typeof body.content === 'string' ? body.content.trim() : ''
    if (!content) return c.json({ error: 'content is required' }, 400)

    const title = await loadEntityTitle(targetId)
    if (title === null) return c.json({ error: notFound }, 404)

    const token = deps.decryptRecallToken(connection.recall_token)
    let item
    try {
      item = await deps.createRecallNote(token, {
        title,
        contentText: deps.appendBacklink(content, `/${kind}/${targetId}`),
        tags: ['bemused'],
      })
    } catch (err) {
      console.error('Failed to create Recall note:', err)
      return c.json({ error: 'Failed to save note to Recall' }, 502)
    }

    const note = await deps.notesService.createNote(kind, targetId, user.id, item.id)
    return c.json({ id: note.id, recall_item_id: item.id }, 201)
  })

  // Unlinks only; the Recall item itself is untouched.
  router.delete('/:id/notes/:noteId', requireAuth, async (c) => {
    const user = c.get('user')!
    const targetId = parseInt(c.req.param('id'))
    const noteId = parseInt(c.req.param('noteId'))

    const note = await deps.notesService.findNoteById(noteId)
    if (!note || note.kind !== kind || note.target_id !== targetId) return c.json({ error: 'Not found' }, 404)
    if (note.author_user_id !== user.id && !user.admin) return c.json({ error: 'Not permitted' }, 403)

    await deps.notesService.deleteNote(noteId)
    return c.json({ ok: true })
  })

  return router
}

// server/src/routes/entityImageRoutes.ts
import type { Hono } from 'hono'
import { entityImagesService, type EntityKind } from '../services/entityImagesService.js'
import { ImageStorageError } from '../services/imageStorage.js'

// GET/POST /<kind>/:id/images, PATCH …/:imgId/primary, DELETE …/:imgId —
// identical for albums and artists.
export function registerEntityImageRoutes(router: Hono<any>, kind: EntityKind) {
  router.get(`/${kind}/:id/images`, async (c) => {
    const id = parseInt(c.req.param('id'))
    return c.json(await entityImagesService.list(kind, id))
  })

  router.post(`/${kind}/:id/images`, async (c) => {
    const id = parseInt(c.req.param('id'))
    const { image_url, image_name, set_primary = false } = await c.req.json()
    if (!image_url || !image_name) return c.json({ error: 'image_url and image_name are required' }, 400)
    try {
      const image = await entityImagesService.add(kind, id, { imageUrl: image_url, imageName: image_name, setPrimary: set_primary })
      return c.json({ success: true, image })
    } catch (err) {
      if (err instanceof ImageStorageError) return c.json({ error: err.message }, 400)
      console.error(`Error adding ${kind} image:`, err)
      return c.json({ error: 'Failed to save image' }, 500)
    }
  })

  router.patch(`/${kind}/:id/images/:imgId/primary`, async (c) => {
    const id = parseInt(c.req.param('id'))
    const imgId = parseInt(c.req.param('imgId'))
    try {
      const image = await entityImagesService.setPrimary(kind, id, imgId)
      if (!image) return c.json({ error: 'Image not found' }, 404)
      return c.json({ success: true, image })
    } catch (err) {
      console.error(`Error setting primary ${kind} image:`, err)
      return c.json({ error: 'Failed to set primary image' }, 500)
    }
  })

  router.delete(`/${kind}/:id/images/:imgId`, async (c) => {
    const id = parseInt(c.req.param('id'))
    const imgId = parseInt(c.req.param('imgId'))
    try {
      if (!(await entityImagesService.remove(kind, id, imgId))) return c.json({ error: 'Image not found' }, 404)
      return c.json({ success: true })
    } catch (err) {
      console.error(`Error deleting ${kind} image:`, err)
      return c.json({ error: 'Failed to delete image' }, 500)
    }
  })
}

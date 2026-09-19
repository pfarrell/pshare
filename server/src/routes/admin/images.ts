import { Hono } from 'hono'
import { registerEntityImageRoutes } from '../entityImageRoutes.js'

const router = new Hono()

// --- Image management routes (shared service) ---

registerEntityImageRoutes(router, 'album')
registerEntityImageRoutes(router, 'artist')

export default router

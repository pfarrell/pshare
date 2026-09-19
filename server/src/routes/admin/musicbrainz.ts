import { Hono } from 'hono'
import {
  searchArtistsMB,
  searchReleasesMB,
  searchRecordingsMB,
} from '../../services/musicbrainzLocal.js'

const router = new Hono()

// GET /admin/musicbrainz/search-artist?q= — proxy an artist search to MusicBrainz
router.get('/musicbrainz/search-artist', async (c) => {
  const q = (c.req.query('q') ?? '').trim()
  if (q.length < 2) return c.json([])

  try {
    const results = await searchArtistsMB(q)
    return c.json(results)
  } catch (error) {
    console.error('MusicBrainz artist search failed:', error)
    return c.json({ error: 'Could not reach MusicBrainz to search — try again' }, 502)
  }
})

// GET /admin/musicbrainz/search-release?q= — proxy a release search to MusicBrainz
router.get('/musicbrainz/search-release', async (c) => {
  const q = (c.req.query('q') ?? '').trim()
  if (q.length < 2) return c.json([])

  try {
    const results = await searchReleasesMB(q)
    return c.json(results)
  } catch (error) {
    console.error('MusicBrainz release search failed:', error)
    return c.json({ error: 'Could not reach MusicBrainz to search — try again' }, 502)
  }
})

// GET /admin/musicbrainz/search-recording?q= — recording search against the local MusicBrainz mirror
router.get('/musicbrainz/search-recording', async (c) => {
  const q = (c.req.query('q') ?? '').trim()
  const artist = (c.req.query('artist') ?? '').trim() || undefined
  if (q.length < 2) return c.json([])

  try {
    const results = await searchRecordingsMB(q, artist)
    return c.json(results)
  } catch (error) {
    console.error('MusicBrainz recording search failed:', error)
    return c.json({ error: 'Could not reach MusicBrainz to search — try again' }, 502)
  }
})

export default router

// Spotify catalog helpers for in-app playback (experimental, #72).
import { Hono } from 'hono'
import { getSpotifyAlbumTracks, isSpotifyConfigured, SpotifyApiError, SpotifyRateLimitError } from '../services/spotify.js'

const spotify = new Hono()

const SPOTIFY_ID = /^[A-Za-z0-9]{1,64}$/

// GET /spotify/albums/:id/tracks — every track of a Spotify album (all pages),
// for enqueueing a whole album. Unconfigured is a normal 200, like /search/spotify.
spotify.get('/albums/:id/tracks', async (c) => {
  const id = c.req.param('id')
  if (!SPOTIFY_ID.test(id)) return c.json({ error: 'Invalid album id' }, 400)
  if (!isSpotifyConfigured()) return c.json({ configured: false, album: null, tracks: [] })

  try {
    const { album, tracks } = await getSpotifyAlbumTracks(id)
    return c.json({ configured: true, album, tracks })
  } catch (err) {
    if (err instanceof SpotifyRateLimitError) {
      if (err.retryAfter !== null) c.header('Retry-After', String(err.retryAfter))
      return c.json({ error: 'Spotify rate limit exceeded', retryAfter: err.retryAfter }, 429)
    }
    if (err instanceof SpotifyApiError && err.status === 404) return c.json({ error: 'Spotify album not found' }, 404)
    console.error('Spotify album tracks failed:', err)
    return c.json({ error: 'Spotify album tracks failed' }, 502)
  }
})

export default spotify

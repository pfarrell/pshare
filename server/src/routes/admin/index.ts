// Admin API (mounted under /admin behind requireAdmin in src/index.ts).
import { Hono } from 'hono'
import artists from './artists.js'
import albums from './albums.js'
import tracks from './tracks.js'
import relations from './relations.js'
import images from './images.js'
import musicbrainz from './musicbrainz.js'
import tags from './tags.js'
import duplicates from './duplicates.js'

const admin = new Hono()

admin.route('/', artists)
admin.route('/', albums)
admin.route('/', tracks)
admin.route('/', relations)
admin.route('/', images)
admin.route('/', musicbrainz)
admin.route('/', tags)
admin.route('/', duplicates)

export default admin

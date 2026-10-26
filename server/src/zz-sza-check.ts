import { searchSpotify } from './services/spotify.js'
import { spotifyLibraryMatcher, filterRelevantArtists } from './services/spotifyLibraryMatch.js'
import { db } from './db/database.js'
for (const q of ['sza', 'rza']) {
  const raw = await searchSpotify(q)
  const relevant = filterRelevantArtists(raw.artists, q)
  const out: any = await spotifyLibraryMatcher.annotate({ ...raw, artists: relevant })
  console.log(`== ${q}: raw artists=${raw.artists.map((a) => a.name).join(', ')}`)
  console.log(`   after relevance: ${relevant.map((a) => a.name).join(', ') || '(none)'}`)
  for (const k of ['artists', 'albums', 'tracks']) console.log(`   ${k}: ` + out[k].map((i: any) => `${i.name}${i.localId ? ' [OWNED #' + i.localId + ']' : ''}`).join(' | '))
}
const t = await db.selectFrom('tracks').select(['id', 'title']).where('title', 'ilike', '%sza%').limit(5).execute()
console.log('local tracks mentioning sza:', t.map((r) => r.title).join(' | ') || '(none)')
await db.destroy()

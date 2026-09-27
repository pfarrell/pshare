#!/usr/bin/env tsx
// server/scripts/backfill-mb-tags.ts
// Backfills artist_mb_tags/album_mb_tags for every artist/album that already
// has a musicbrainz_id, using the same capture functions the live hooks use
// (server/src/services/musicbrainzTags.ts) — no duplicated join logic.
//
// Usage: tsx scripts/backfill-mb-tags.ts [--limit N] [--all]
//   --all     re-check every entity with a musicbrainz_id, not just ones with
//             zero rows in artist_mb_tags/album_mb_tags yet — use this to
//             refresh tag_count after the mirror itself gets refreshed.

import 'dotenv/config'
import { sql } from 'kysely'
import { db } from '../src/db/database.js'
import { captureArtistTags, captureAlbumTags } from '../src/services/musicbrainzTags.js'

const args = process.argv.slice(2)
const getArg = (flag: string) => {
  const i = args.indexOf(flag)
  return i !== -1 ? args[i + 1] : undefined
}
const hasFlag = (flag: string) => args.includes(flag)

const limit = getArg('--limit') ? parseInt(getArg('--limit')!) : undefined
const all = hasFlag('--all')

async function backfillArtists() {
  let query = db
    .selectFrom('artists')
    .select(['id', 'name', 'musicbrainz_id'])
    .where('musicbrainz_id', 'is not', null)

  if (!all) {
    query = query.where(sql<boolean>`NOT EXISTS (SELECT 1 FROM artist_mb_tags WHERE artist_mb_tags.artist_id = artists.id)`) as typeof query
  }
  if (limit) query = query.limit(limit) as typeof query

  const artists = await query.execute()
  console.log(`\n🎤 Found ${artists.length} artists to check`)

  let ok = 0, failed = 0
  for (const artist of artists) {
    try {
      await captureArtistTags(artist.id, artist.musicbrainz_id!)
      console.log(`  ✅ ${artist.name}`)
      ok++
    } catch (err) {
      console.warn(`  ⚠️  Tag capture failed for artist ${artist.id} "${artist.name}": ${(err as Error).message}`)
      failed++
    }
  }
  console.log(`  Artists: ✅ ${ok} captured | ⚠️  ${failed} failed`)
}

async function backfillAlbums() {
  let query = db
    .selectFrom('albums')
    .innerJoin('artists', 'artists.id', 'albums.artist_id')
    .select(['albums.id', 'albums.title', 'albums.musicbrainz_id', 'artists.name as artist_name'])
    .where('albums.musicbrainz_id', 'is not', null)

  if (!all) {
    query = query.where(sql<boolean>`NOT EXISTS (SELECT 1 FROM album_mb_tags WHERE album_mb_tags.album_id = albums.id)`) as typeof query
  }
  if (limit) query = query.limit(limit) as typeof query

  const albums = await query.execute()
  console.log(`\n📀 Found ${albums.length} albums to check`)

  let ok = 0, failed = 0
  for (const album of albums) {
    try {
      await captureAlbumTags(album.id, album.musicbrainz_id!)
      console.log(`  ✅ "${album.artist_name}" — "${album.title}"`)
      ok++
    } catch (err) {
      console.warn(`  ⚠️  Tag capture failed for album ${album.id} "${album.title}": ${(err as Error).message}`)
      failed++
    }
  }
  console.log(`  Albums: ✅ ${ok} captured | ⚠️  ${failed} failed`)
}

async function main() {
  await backfillArtists()
  await backfillAlbums()
  console.log('\n✨ Done')
  process.exit(0)
}

main().catch(err => {
  console.error('Fatal error:', err)
  process.exit(1)
})

// server/src/services/musicbrainzTags.ts
//
// Backfills and live-captures artist/album tags from the local MusicBrainz
// mirror. Split into mirror-read functions (this file, below) and bemused-DB
// write functions (added in a later task) so the write half is unit-testable
// without a live mirror connection — matching this codebase's existing
// convention of leaving mirror-query code itself untested (see
// musicbrainzLocal.ts, which has none either). See
// docs/superpowers/specs/2026-09-27-musicbrainz-tag-backfill-design.md.

import { mbDb } from '../db/musicbrainzDb.js'
import { db } from '../db/database.js'
import type { Transaction } from 'kysely'
import type { Database } from '../db/database.js'

export interface MbTagRow {
  name: string
  count: number
}

export async function fetchArtistTagsFromMirror(mbid: string): Promise<MbTagRow[]> {
  const rows = await mbDb
    .selectFrom('artist_tag')
    .innerJoin('artist', 'artist.id', 'artist_tag.artist')
    .innerJoin('tag', 'tag.id', 'artist_tag.tag')
    .select(['tag.name', 'artist_tag.count'])
    .where('artist.gid', '=', mbid)
    // MusicBrainz aggregates community up/downvotes into this count, and it
    // can be zero or negative after net downvotes — the MusicBrainz website
    // itself filters these out, so we do too.
    .where('artist_tag.count', '>', 0)
    .execute()

  return rows.map(r => ({ name: r.name, count: r.count }))
}

export async function fetchAlbumTagsFromMirror(releaseMbid: string): Promise<MbTagRow[]> {
  const rows = await mbDb
    .selectFrom('release')
    .innerJoin('release_group_tag', 'release_group_tag.release_group', 'release.release_group')
    .innerJoin('tag', 'tag.id', 'release_group_tag.tag')
    .select(['tag.name', 'release_group_tag.count'])
    .where('release.gid', '=', releaseMbid)
    // See fetchArtistTagsFromMirror above — same net-downvote filtering.
    .where('release_group_tag.count', '>', 0)
    .execute()

  return rows.map(r => ({ name: r.name, count: r.count }))
}

async function upsertMbTagId(trx: Transaction<Database>, name: string): Promise<number> {
  const inserted = await trx
    .insertInto('mb_tags')
    .values({ name })
    .onConflict(oc => oc.column('name').doUpdateSet({ name }))
    .returning('id')
    .executeTakeFirstOrThrow()
  return inserted.id
}

export async function applyArtistTags(artistId: number, mbid: string, tagRows: MbTagRow[]): Promise<void> {
  // Sort by tag name before acquiring any row locks: upsertMbTagId's
  // ON CONFLICT DO UPDATE takes a row lock on the mb_tags row that's held
  // until the transaction commits. Two concurrent captures whose tag sets
  // overlap, processed in different orders, could otherwise deadlock —
  // sorting guarantees every transaction acquires those locks in the same
  // order.
  const sortedTagRows = tagRows.slice().sort((a, b) => a.name.localeCompare(b.name))

  await db.transaction().execute(async trx => {
    // Every capture re-derives the complete, current set of tags from the
    // mirror, so the simplest correct approach is delete-then-reinsert
    // rather than a differential update against whatever was there before —
    // this also means a mirror result of zero tags (or an mbid change)
    // correctly clears out previously-captured rows rather than leaving them
    // stranded under a stale source_mbid.
    await trx
      .deleteFrom('artist_mb_tags')
      .where('artist_id', '=', artistId)
      .execute()

    for (const row of sortedTagRows) {
      const tagId = await upsertMbTagId(trx, row.name)
      await trx
        .insertInto('artist_mb_tags')
        .values({ artist_id: artistId, source_mbid: mbid, tag_id: tagId, tag_count: row.count })
        .execute()
    }
  })
}

export async function applyAlbumTags(albumId: number, mbid: string, tagRows: MbTagRow[]): Promise<void> {
  // See applyArtistTags above — same lock-ordering rationale.
  const sortedTagRows = tagRows.slice().sort((a, b) => a.name.localeCompare(b.name))

  await db.transaction().execute(async trx => {
    // Same delete-then-reinsert rationale as applyArtistTags above.
    await trx
      .deleteFrom('album_mb_tags')
      .where('album_id', '=', albumId)
      .execute()

    for (const row of sortedTagRows) {
      const tagId = await upsertMbTagId(trx, row.name)
      await trx
        .insertInto('album_mb_tags')
        .values({ album_id: albumId, source_mbid: mbid, tag_id: tagId, tag_count: row.count })
        .execute()
    }
  })
}

export async function captureArtistTags(artistId: number, mbid: string): Promise<void> {
  const tagRows = await fetchArtistTagsFromMirror(mbid)
  await applyArtistTags(artistId, mbid, tagRows)
}

export async function captureAlbumTags(albumId: number, mbid: string): Promise<void> {
  const tagRows = await fetchAlbumTagsFromMirror(mbid)
  await applyAlbumTags(albumId, mbid, tagRows)
}

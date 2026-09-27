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
  await db.transaction().execute(async trx => {
    // Delete rows from superseded mbids
    await trx
      .deleteFrom('artist_mb_tags')
      .where('artist_id', '=', artistId)
      .where('source_mbid', '!=', mbid)
      .execute()

    // Delete rows from the current mbid (we'll re-insert only what's in tagRows)
    await trx
      .deleteFrom('artist_mb_tags')
      .where('artist_id', '=', artistId)
      .where('source_mbid', '=', mbid)
      .execute()

    for (const row of tagRows) {
      const tagId = await upsertMbTagId(trx, row.name)
      await trx
        .insertInto('artist_mb_tags')
        .values({ artist_id: artistId, source_mbid: mbid, tag_id: tagId, tag_count: row.count })
        .execute()
    }
  })
}

export async function applyAlbumTags(albumId: number, mbid: string, tagRows: MbTagRow[]): Promise<void> {
  await db.transaction().execute(async trx => {
    // Delete rows from superseded mbids
    await trx
      .deleteFrom('album_mb_tags')
      .where('album_id', '=', albumId)
      .where('source_mbid', '!=', mbid)
      .execute()

    // Delete rows from the current mbid (we'll re-insert only what's in tagRows)
    await trx
      .deleteFrom('album_mb_tags')
      .where('album_id', '=', albumId)
      .where('source_mbid', '=', mbid)
      .execute()

    for (const row of tagRows) {
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

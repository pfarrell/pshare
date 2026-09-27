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

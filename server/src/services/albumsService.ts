import { Kysely, sql } from 'kysely'
import { db, Database } from '../db/database.js'
import { SINGLES_ALBUM_TITLE } from '../constants/singles.js'

export function createAlbumsService(db: Kysely<Database>) {
  return {
    async randomByTag(tag: string, size: number) {
      return sql<any>`
        WITH eligible_album_ids AS (
          SELECT DISTINCT al.id
          FROM albums al
          INNER JOIN tracks t ON t.album_id = al.id AND t.approved = true
          INNER JOIN albums_tags at ON at.album_id = al.id
          INNER JOIN tags tg ON tg.id = at.tag_id AND tg.name = ${tag}
          WHERE al.image_path IS NOT NULL AND al.image_path != ''
            AND al.title != '_Singles'
        ),
        random_ids AS (
          SELECT id FROM eligible_album_ids ORDER BY random() LIMIT ${size}
        )
        SELECT al.id, al.title, al.image_path,
               ar.id AS artist_id, ar.name AS artist_name,
               EXISTS (
                 SELECT 1 FROM artist_albums caa WHERE caa.album_id = al.id AND caa.role = 'collaborator'
               ) AS has_collaborators
        FROM albums al
        INNER JOIN random_ids r ON al.id = r.id
        INNER JOIN artists ar ON ar.id = al.artist_id
      `.execute(db)
    },

    async randomAll(size: number) {
      return sql<any>`
        WITH eligible_album_ids AS (
          SELECT DISTINCT al.id
          FROM albums al
          INNER JOIN tracks t ON t.album_id = al.id AND t.approved = true
          WHERE al.image_path IS NOT NULL AND al.image_path != ''
            AND al.title != '_Singles'
        ),
        random_ids AS (
          SELECT id FROM eligible_album_ids ORDER BY random() LIMIT ${size}
        )
        SELECT al.id, al.title, al.image_path,
               ar.id AS artist_id, ar.name AS artist_name,
               EXISTS (
                 SELECT 1 FROM artist_albums caa WHERE caa.album_id = al.id AND caa.role = 'collaborator'
               ) AS has_collaborators
        FROM albums al
        INNER JOIN random_ids r ON al.id = r.id
        INNER JOIN artists ar ON ar.id = al.artist_id
      `.execute(db)
    },

    async recentlyPlayed(size: number) {
      return sql<any>`
        SELECT al.id, al.title, al.image_path,
               ar.id AS artist_id, ar.name AS artist_name,
               EXISTS (
                 SELECT 1 FROM artist_albums caa WHERE caa.album_id = al.id AND caa.role = 'collaborator'
               ) AS has_collaborators,
               MAX(lg.created_at) AS last_played
        FROM logs lg
        INNER JOIN albums al ON al.id = lg.album_id
        INNER JOIN artists ar ON ar.id = al.artist_id
        WHERE al.image_path IS NOT NULL AND al.image_path != ''
          AND al.title != '_Singles'
        GROUP BY al.id, al.title, al.image_path, ar.id, ar.name
        ORDER BY last_played DESC
        LIMIT ${size}
      `.execute(db)
    },

    async findAlbumById(id: number) {
      return db
        .selectFrom('albums')
        .selectAll()
        .where('id', '=', id)
        .executeTakeFirst()
    },

    async findArtistById(id: number) {
      return db
        .selectFrom('artists')
        .selectAll()
        .where('id', '=', id)
        .executeTakeFirst()
    },

    async findTracksByAlbumId(albumId: number) {
      return db
        .selectFrom('tracks')
        .leftJoin('artists as track_artist', 'track_artist.id', 'tracks.artist_id')
        .select([
          'tracks.id',
          'tracks.title',
          'tracks.track_number',
          'tracks.duration_sec',
          'tracks.album_id',
          'tracks.artist_id',
          'track_artist.name as artist_name',
          'track_artist.image_path as artist_image_path',
        ])
        .where('tracks.album_id', '=', albumId)
        .where('tracks.approved', '=', true)
        .execute()
    },

    async findSecondaryArtistsByAlbumId(albumId: number) {
      return db
        .selectFrom('artist_albums')
        .innerJoin('artists as sa', 'sa.id', 'artist_albums.artist_id')
        .select([
          'artist_albums.artist_id as id',
          'sa.name',
          'artist_albums.role',
        ])
        .where('artist_albums.album_id', '=', albumId)
        .where('artist_albums.role', '!=', 'primary')
        .orderBy('artist_albums.order', 'asc')
        .execute()
    },

    async findCollectionsByAlbumId(albumId: number) {
      return db
        .selectFrom('collection_albums')
        .innerJoin('collections', 'collections.id', 'collection_albums.collection_id')
        .select([
          'collections.id as id',
          'collections.name as name',
        ])
        .where('collection_albums.album_id', '=', albumId)
        .orderBy('collections.name', 'asc')
        .execute()
    },

    async findAlbumStub(id: number) {
      return db
        .selectFrom('albums')
        .select(['id', 'title', 'image_path'])
        .where('id', '=', id)
        .executeTakeFirst()
    },

    // Returns the album immediately before/after `albumId` within `collectionId`'s
    // ordering, or undefined if `albumId` isn't actually a member of that
    // collection (caller should fall back to findAdjacentInArtist in that case).
    async findAdjacentInCollection(albumId: number, collectionId: number) {
      const result = await sql<{ prev_id: number | null; next_id: number | null }>`
        WITH ranked AS (
          SELECT album_id,
                 LAG(album_id) OVER (ORDER BY "order" ASC) AS prev_id,
                 LEAD(album_id) OVER (ORDER BY "order" ASC) AS next_id
          FROM collection_albums
          WHERE collection_id = ${collectionId}
        )
        SELECT prev_id, next_id FROM ranked WHERE album_id = ${albumId}
      `.execute(db)
      return result.rows[0]
    },

    // Ranks by the same key as the Artist page's own album grid
    // (server/src/routes/artists.ts) — has_release_year DESC, sort_year DESC,
    // title ASC, i.e. newest release first. "prev"/"next" here mean release
    // chronology (previous = older, next = newer), same convention as a
    // Wikipedia infobox — which is the *opposite* direction from that grid's
    // own newest-first listing, so this deliberately uses LEAD for prev_id
    // and LAG for next_id, not the other way around.
    async findAdjacentInArtist(albumId: number, artistId: number) {
      const result = await sql<{ prev_id: number | null; next_id: number | null }>`
        WITH albums_ordered AS (
          SELECT DISTINCT albums.id,
                 (albums.release_year IS NOT NULL AND albums.release_year != '' AND albums.release_year != '0') AS has_release_year,
                 CASE WHEN albums.release_year IS NOT NULL AND albums.release_year != '' AND albums.release_year != '0' THEN albums.release_year END AS sort_year,
                 albums.title
          FROM albums
          INNER JOIN tracks ON tracks.album_id = albums.id AND tracks.approved = true
          WHERE albums.title != ${SINGLES_ALBUM_TITLE}
            AND (albums.artist_id = ${artistId}
             OR EXISTS (
               SELECT 1 FROM artist_albums ca WHERE ca.album_id = albums.id AND ca.artist_id = ${artistId} AND ca.role = 'collaborator'
             ))
        ),
        ranked AS (
          SELECT id,
                 LEAD(id) OVER (ORDER BY has_release_year DESC, sort_year DESC, title ASC) AS prev_id,
                 LAG(id) OVER (ORDER BY has_release_year DESC, sort_year DESC, title ASC) AS next_id
          FROM albums_ordered
        )
        SELECT prev_id, next_id FROM ranked WHERE id = ${albumId}
      `.execute(db)
      return result.rows[0] ?? { prev_id: null, next_id: null }
    },
  }
}

export const albumsService = createAlbumsService(db)

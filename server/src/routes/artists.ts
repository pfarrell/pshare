import { Hono } from 'hono'
import { db } from '../db/database.js'
import { getArtistSummary } from '../services/wikipedia.js'
import { streamBase } from '../db/streamUrl.js'
import { sql } from 'kysely'
import { countsService } from '../services/countsService.js'
import { requireAuth } from '../middleware/auth.js'
import type { Variables } from '../types.js'

// Minimum similarity score to include in similar_artists response (0–1 scale).
// Adjust this constant to tune how many similar artists appear on artist pages.
const SIMILAR_ARTIST_MIN_SIMILARITY = 0.8

const artists = new Hono<{ Variables: Variables }>()

// Fetches an artist's own discography exactly as their own artist page would:
// albums they own outright plus albums where they're credited as a
// 'collaborator' (treated as a full release, not an "appears on" credit),
// with any "_Singles" album split out into a flat singles list. Shared
// between the requested artist and each group they're a member_of, so a
// member's page can show a group's discography as its own section.
async function fetchArtistDiscography(c: any, id: number, name: string, imagePath: string | null) {
  const albumRows = await sql<{
    id: number
    title: string
    release_year: string | null
    image_path: string | null
    primary_artist_id: number
    primary_artist_name: string
    has_collaborators: boolean
  }>`
    SELECT DISTINCT albums.id, albums.title, albums.release_year, albums.image_path,
           pa.id AS primary_artist_id, pa.name AS primary_artist_name,
           EXISTS (
             SELECT 1 FROM artist_albums caa WHERE caa.album_id = albums.id AND caa.role = 'collaborator'
           ) AS has_collaborators,
           (albums.release_year IS NOT NULL AND albums.release_year != '' AND albums.release_year != '0') AS has_release_year,
           CASE WHEN albums.release_year IS NOT NULL AND albums.release_year != '' AND albums.release_year != '0' THEN albums.release_year END AS sort_year
    FROM albums
    INNER JOIN artists pa ON pa.id = albums.artist_id
    INNER JOIN tracks ON tracks.album_id = albums.id AND tracks.approved = true
    WHERE albums.artist_id = ${id}
       OR EXISTS (
         SELECT 1 FROM artist_albums ca WHERE ca.album_id = albums.id AND ca.artist_id = ${id} AND ca.role = 'collaborator'
       )
    ORDER BY has_release_year DESC, sort_year DESC, albums.title ASC
  `.execute(db)

  const albumTrackCounts = await countsService.trackCountsByAlbumIds(albumRows.rows.map((a) => a.id))

  const allFilteredAlbums = albumRows.rows.map((a) => ({
    id: a.id,
    title: a.title,
    release_year: a.release_year,
    image_path: a.image_path,
    artist: { id: a.primary_artist_id, name: a.primary_artist_name },
    has_collaborators: a.has_collaborators,
    track_count: albumTrackCounts.get(a.id) ?? 0,
  }))

  const singlesAlbumIds = allFilteredAlbums.filter(a => a.title === '_Singles').map(a => a.id)
  const albums = allFilteredAlbums.filter(a => a.title !== '_Singles')

  let singles: any[] = []
  if (singlesAlbumIds.length > 0) {
    const singlesRows = await db
      .selectFrom('tracks')
      .innerJoin('artists as ta', 'ta.id', 'tracks.artist_id')
      .innerJoin('albums', 'albums.id', 'tracks.album_id')
      .select([
        'tracks.id',
        'tracks.title',
        'tracks.duration_sec',
        'tracks.track_number',
        'ta.id as artist_id',
        'ta.name as artist_name',
        'albums.id as album_id',
        'albums.title as album_title',
        'albums.release_year as album_release_year',
      ])
      .where('tracks.album_id', 'in', singlesAlbumIds)
      .where('tracks.approved', '=', true)
      .orderBy('tracks.track_number', 'asc')
      .execute()

    singlesRows.sort((a, b) => (parseInt(a.track_number ?? '0') || 0) - (parseInt(b.track_number ?? '0') || 0))

    singles = singlesRows.map(t => ({
      id: t.id,
      title: t.title,
      duration: t.duration_sec,
      track_number: t.track_number,
      artist: { id: t.artist_id, name: t.artist_name },
      album: { id: t.album_id, title: t.album_title, release_year: t.album_release_year, artist: { id, name } },
      image_path: imagePath,
      url: `${streamBase(c)}/stream/${t.id}`,
      download_url: `${streamBase(c)}/download/${t.id}`,
    }))
  }

  return { albums, singles }
}

// GET /artists/random?size=N&tag=slug — gated: this powers the logged-in
// Home feed and must not become a public catalog-browsing endpoint just
// because /artist/:id (below, in this same router) is public.
artists.get('/random', requireAuth, async (c) => {
  const size = Math.min(parseInt(c.req.query('size') ?? '10'), 200)
  const tag = c.req.query('tag')

  const rows = tag
    ? await sql<any>`
        WITH eligible_artist_ids AS (
          SELECT DISTINCT a.id
          FROM artists a
          INNER JOIN albums al ON al.artist_id = a.id
          INNER JOIN artists_tags at ON at.artist_id = a.id
          INNER JOIN tags tg ON tg.id = at.tag_id AND tg.name = ${tag}
          WHERE a.image_path IS NOT NULL
        ),
        random_ids AS (
          SELECT id FROM eligible_artist_ids ORDER BY random() LIMIT ${size}
        )
        SELECT a.*
        FROM artists a
        INNER JOIN random_ids r ON a.id = r.id
      `.execute(db)
    : await sql<any>`
        WITH eligible_artist_ids AS (
          SELECT DISTINCT a.id
          FROM artists a
          INNER JOIN albums al ON al.artist_id = a.id
          WHERE a.image_path IS NOT NULL
        ),
        random_ids AS (
          SELECT id FROM eligible_artist_ids ORDER BY random() LIMIT ${size}
        )
        SELECT a.*
        FROM artists a
        INNER JOIN random_ids r ON a.id = r.id
      `.execute(db)

  const artistIds = rows.rows.map((row: any) => row.id)
  const albumCounts = await countsService.albumCountsByArtistIds(artistIds)

  return c.json(rows.rows.map((row: any) => ({
    ...row,
    album_count: albumCounts.get(row.id) ?? 0,
  })))
})

// GET /artist/:id
artists.get('/:id', async (c) => {
  const id = parseInt(c.req.param('id'))
  if (!Number.isInteger(id)) return c.json({ error: 'Not found' }, 404)

  const artist = await db
    .selectFrom('artists')
    .selectAll()
    .where('id', '=', id)
    .executeTakeFirst()

  if (!artist) return c.json({ error: 'Not found' }, 404)

  // A collaboration (role='collaborator') is treated as a full release for
  // every artist on it, not just its primary owner — so this pulls in both
  // albums this artist owns outright AND albums where they're credited as a
  // collaborator (e.g. "The Union" appears on both Elton John's and Leon
  // Russell's own album list, not tucked away in "Appears On"). Every other
  // non-primary role (featured/guest/compilation) stays out of this list —
  // see appears_on below.
  const { albums: filteredAlbums, singles: ownSingles } = await fetchArtistDiscography(c, artist.id, artist.name, artist.image_path)

  const appearsOnRows = await db
    .selectFrom('artist_albums')
    .innerJoin('albums', 'albums.id', 'artist_albums.album_id')
    .innerJoin('artists as al_artist', 'al_artist.id', 'albums.artist_id')
    .select([
      'albums.id',
      'albums.title',
      'albums.release_year',
      'albums.image_path',
      'al_artist.id as primary_artist_id',
      'al_artist.name as primary_artist_name',
    ])
    .where('artist_albums.artist_id', '=', id)
    .where('artist_albums.role', 'not in', ['primary', 'collaborator', 'composer', 'performer'])
    .orderBy('albums.release_year', 'asc')
    .execute()

  // Classical composer/performer credits — kept out of appears_on (composer
  // and performer are full-recording credits, not guest/featured spots) and
  // shown as their own section instead. Symmetric: whichever role isn't this
  // artist's role on a given album is the "primary_artist" they performed
  // with/composed for, since exactly one of composer/performer is the
  // album's actual primary artist and the other is this secondary credit.
  const performancesRows = await db
    .selectFrom('artist_albums')
    .innerJoin('albums', 'albums.id', 'artist_albums.album_id')
    .innerJoin('artists as al_artist', 'al_artist.id', 'albums.artist_id')
    .select([
      'albums.id',
      'albums.title',
      'albums.release_year',
      'albums.image_path',
      'al_artist.id as primary_artist_id',
      'al_artist.name as primary_artist_name',
    ])
    .where('artist_albums.artist_id', '=', id)
    .where('artist_albums.role', 'in', ['composer', 'performer'])
    .orderBy('albums.release_year', 'asc')
    .execute()

  const performancesTrackCounts = await countsService.trackCountsByAlbumIds(performancesRows.map(a => a.id))

  const performances = performancesRows.map(a => ({
    id: a.id,
    title: a.title,
    release_year: a.release_year,
    image_path: a.image_path,
    artist: { id: a.primary_artist_id, name: a.primary_artist_name },
    track_count: performancesTrackCounts.get(a.id) ?? 0,
  }))

  // Albums where this artist has a track credit (tracks.artist_id) but isn't
  // the album's primary artist and isn't already covered by an artist_albums
  // secondary-credit row above — e.g. a compilation track (Easy Rider's
  // Steppenwolf track showing on Steppenwolf's own artist page).
  const trackCreditRows = await sql<{
    id: number
    title: string
    release_year: string | null
    image_path: string | null
    primary_artist_id: number
    primary_artist_name: string
  }>`
    SELECT DISTINCT albums.id, albums.title, albums.release_year, albums.image_path,
           al_artist.id AS primary_artist_id, al_artist.name AS primary_artist_name
    FROM tracks
    INNER JOIN albums ON albums.id = tracks.album_id
    INNER JOIN artists al_artist ON al_artist.id = albums.artist_id
    WHERE tracks.artist_id = ${id}
      AND tracks.approved = true
      AND albums.artist_id != ${id}
      AND NOT EXISTS (
        SELECT 1 FROM artist_albums
        WHERE artist_albums.album_id = albums.id AND artist_albums.artist_id = ${id}
      )
  `.execute(db)

  const appearsOnTrackCounts = await countsService.trackCountsByAlbumIds([
    ...appearsOnRows.map(a => a.id),
    ...trackCreditRows.rows.map(a => a.id),
  ])

  const appears_on = [
    ...appearsOnRows.map(a => ({
      id: a.id,
      title: a.title,
      release_year: a.release_year,
      image_path: a.image_path,
      artist: { id: a.primary_artist_id, name: a.primary_artist_name },
      track_count: appearsOnTrackCounts.get(a.id) ?? 0,
    })),
    ...trackCreditRows.rows.map(a => ({
      id: a.id,
      title: a.title,
      release_year: a.release_year,
      image_path: a.image_path,
      artist: { id: a.primary_artist_id, name: a.primary_artist_name },
      track_count: appearsOnTrackCounts.get(a.id) ?? 0,
    })),
  ]

  const relationRows = await db
    .selectFrom('artist_relations')
    .innerJoin('artists as ra', 'ra.id', 'artist_relations.related_artist_id')
    .select(['ra.id', 'ra.name', 'artist_relations.kind', 'artist_relations.source'])
    .where('artist_relations.artist_id', '=', id)
    .where('artist_relations.is_hidden', '=', false)
    .orderBy('ra.name', 'asc')
    .execute()

  const related_artists = relationRows.filter(r => r.kind === 'related' && r.source === 'manual').map(r => ({ id: r.id, name: r.name }))
  const members = relationRows.filter(r => r.kind === 'member').map(r => ({ id: r.id, name: r.name }))

  const memberOfRows = await db
    .selectFrom('artist_relations')
    .innerJoin('artists as ga', 'ga.id', 'artist_relations.artist_id')
    .select(['ga.id', 'ga.name', 'ga.image_path'])
    .where('artist_relations.related_artist_id', '=', id)
    .where('artist_relations.kind', '=', 'member')
    .orderBy('ga.name', 'asc')
    .execute()

  // Each group's own discography, shown as a section on the member's page
  // (one-directional — a group's own page doesn't pull in its members'
  // other work). Groups with no approved-track albums are omitted rather
  // than shown as an empty section.
  const groupDiscographies = await Promise.all(
    memberOfRows.map((g) => fetchArtistDiscography(c, g.id, g.name, g.image_path))
  )
  const group_albums = memberOfRows
    .map((g, i) => ({ group: { id: g.id, name: g.name }, albums: groupDiscographies[i].albums }))
    .filter((g) => g.albums.length > 0)
  const singles = [...ownSingles, ...groupDiscographies.flatMap((d) => d.singles)]

  const similarRows = await db
    .selectFrom('artist_relations as ar')
    .innerJoin('artists as ra', 'ra.id', 'ar.related_artist_id')
    .select([
      'ra.id',
      'ra.name',
      'ar.similarity',
      sql<boolean>`EXISTS(
        SELECT 1 FROM tracks t
        INNER JOIN albums al ON al.id = t.album_id
        WHERE al.artist_id = ra.id AND t.approved = true
      )`.as('has_tracks'),
    ])
    .where('ar.artist_id', '=', id)
    .where('ar.kind', '=', 'similar')
    .where(eb => eb.or([
      eb.and([
        eb('ar.source', '=', 'lastfm'),
        eb('ar.similarity', '>=', SIMILAR_ARTIST_MIN_SIMILARITY),
      ]),
      eb('ar.force_show', '=', true),
    ]))
    .where('ar.is_hidden', '=', false)
    .orderBy('ar.similarity', 'desc')
    .execute()

  const similar_artists = similarRows.map(r => ({
    id: r.id,
    name: r.name,
    similarity: r.similarity,
    has_tracks: r.has_tracks,
  }))

  const summary = await getArtistSummary(artist.name, artist.wikipedia)

  return c.json({ artist, summary: summary ?? {}, albums: filteredAlbums, singles, appears_on, performances, related_artists, members, group_albums, similar_artists })
})

// POST /artist/:id/tracks/random — powers Shuffle Artist playback mode. Returns a random
// batch of tracks from this artist's own discography (their own albums plus any they're
// credited as a 'collaborator' on — the same album set fetchArtistDiscography above uses for
// the artist page's own albums grid, including the "_Singles" pseudo-album), shaped exactly
// like GET /album/:id's track objects. Deliberately excludes "Appears On"/"Performances"
// credits (guest/featured/composer/performer spots on other artists' releases) — this is a
// shuffle of the artist's own catalog, not everything they've ever touched.
artists.post('/:id/tracks/random', async (c) => {
  const artistId = parseInt(c.req.param('id'))
  if (!Number.isInteger(artistId)) return c.json({ error: 'Not found' }, 404)

  const artist = await db.selectFrom('artists').select('id').where('id', '=', artistId).executeTakeFirst()
  if (!artist) return c.json({ error: 'Not found' }, 404)

  const body = await c.req.json().catch(() => ({} as any))
  const limit = Math.min(Math.max(parseInt(body.limit) || 25, 1), 100)
  const excludeTrackIds: number[] = Array.isArray(body.excludeTrackIds)
    ? body.excludeTrackIds.filter((id: any) => Number.isInteger(id))
    : []

  const rows = await sql<any>`
    SELECT t.id, t.title, t.track_number, t.duration_sec,
           al.id as album_id, al.title as album_title, al.image_path as album_image_path, al.release_year as album_release_year,
           ar.id as artist_id, ar.name as artist_name,
           track_ar.id as track_artist_id, track_ar.name as track_artist_name
    FROM albums al
    INNER JOIN artists ar ON ar.id = al.artist_id
    INNER JOIN tracks t ON t.album_id = al.id AND t.approved = true
    LEFT JOIN artists track_ar ON track_ar.id = t.artist_id
    WHERE (al.artist_id = ${artistId}
           OR EXISTS (
             SELECT 1 FROM artist_albums caa
             WHERE caa.album_id = al.id AND caa.artist_id = ${artistId} AND caa.role = 'collaborator'
           ))
      ${excludeTrackIds.length ? sql`AND t.id NOT IN (${sql.join(excludeTrackIds)})` : sql``}
    ORDER BY random()
    LIMIT ${limit}
  `.execute(db)

  const tracks = rows.rows.map((t: any) => ({
    id: t.id,
    title: t.title,
    track_number: t.track_number,
    duration: t.duration_sec,
    album: { id: t.album_id, title: t.album_title, release_year: t.album_release_year, artist: { id: t.artist_id, name: t.artist_name } },
    artist: { id: t.track_artist_id ?? t.artist_id, name: t.track_artist_name ?? t.artist_name },
    image_path: t.album_image_path,
    url: `${streamBase(c)}/stream/${t.id}`,
    download_url: `${streamBase(c)}/download/${t.id}`,
  }))

  return c.json({ tracks })
})

export default artists

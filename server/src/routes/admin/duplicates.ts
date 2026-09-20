import { Hono } from 'hono'
import type { Variables } from '../../types.js'
import { db } from '../../db/database.js'
import { titlesRoughlyMatch } from '../../utils/titleMatch.js'

const pairKey = (a: number, b: number): string => (a < b ? `${a}-${b}` : `${b}-${a}`)

// Turns a sorted-by-id group into consecutive pairs so a group of size N
// yields exactly N-1 pairs — e.g. [1,2,3] -> [[1,2],[2,3]]. After any one
// pair in a larger group is resolved, live re-detection naturally
// re-chains the remainder on the next page load.
function chainPairs<T extends { id: number }>(members: T[]): [T, T][] {
  const sorted = [...members].sort((a, b) => a.id - b.id)
  const pairs: [T, T][] = []
  for (let i = 0; i < sorted.length - 1; i++) pairs.push([sorted[i], sorted[i + 1]])
  return pairs
}

// Groups items sharing a title into duplicate clusters within one bucket
// (all items already known to share some other key, e.g. artist_id or
// album_id) via pairwise titlesRoughlyMatch — connects an item to the
// first existing cluster it roughly-matches any member of.
function clusterByTitle<T extends { id: number; title: string }>(items: T[]): T[][] {
  const clusters: T[][] = []
  for (const item of items) {
    const cluster = clusters.find((c) => c.some((m) => titlesRoughlyMatch(m.title, item.title)))
    if (cluster) cluster.push(item)
    else clusters.push([item])
  }
  return clusters.filter((c) => c.length > 1)
}

const router = new Hono<{ Variables: Variables }>()

router.post('/duplicates/dismiss', async (c) => {
  const body = await c.req.json()
  const { kind, entity_a_id, entity_b_id } = body
  if (kind !== 'album' && kind !== 'track') {
    return c.json({ error: 'kind must be "album" or "track"' }, 400)
  }
  const idA = parseInt(entity_a_id)
  const idB = parseInt(entity_b_id)
  if (!Number.isInteger(idA) || !Number.isInteger(idB) || idA === idB) {
    return c.json({ error: 'entity_a_id and entity_b_id must be distinct integers' }, 400)
  }
  const [lo, hi] = idA < idB ? [idA, idB] : [idB, idA]
  const user = c.get('user')

  await db
    .insertInto('dismissed_duplicates')
    .values({ kind, entity_a_id: lo, entity_b_id: hi, dismissed_by: user?.id ?? null })
    .onConflict((oc) => oc.columns(['kind', 'entity_a_id', 'entity_b_id']).doNothing())
    .execute()

  return c.json({ success: true })
})

router.get('/duplicates/albums', async (c) => {
  const page = Math.max(1, parseInt(c.req.query('page') ?? '1') || 1)
  const limit = Math.max(1, parseInt(c.req.query('limit') ?? '25') || 1)

  const dismissedRows = await db
    .selectFrom('dismissed_duplicates')
    .select(['entity_a_id', 'entity_b_id'])
    .where('kind', '=', 'album')
    .execute()
  const dismissedSet = new Set(dismissedRows.map((d) => pairKey(d.entity_a_id, d.entity_b_id)))

  const albums = await db
    .selectFrom('albums')
    .leftJoin('artists', 'artists.id', 'albums.artist_id')
    .select([
      'albums.id', 'albums.artist_id', 'albums.title', 'albums.release_group_musicbrainz_id',
      'albums.release_year', 'albums.image_path', 'artists.name as artist_name',
    ])
    .execute()

  const byArtist = new Map<number, typeof albums>()
  for (const a of albums) {
    const list = byArtist.get(a.artist_id) ?? []
    list.push(a)
    byArtist.set(a.artist_id, list)
  }

  type AlbumRow = (typeof albums)[number]
  type Pair = { tier: 1 | 2; a: AlbumRow; b: AlbumRow }
  const pairs: Pair[] = []
  const tier1Keys = new Set<string>()

  for (const artistAlbums of byArtist.values()) {
    const byReleaseGroup = new Map<string, AlbumRow[]>()
    for (const a of artistAlbums) {
      if (!a.release_group_musicbrainz_id) continue
      const list = byReleaseGroup.get(a.release_group_musicbrainz_id) ?? []
      list.push(a)
      byReleaseGroup.set(a.release_group_musicbrainz_id, list)
    }
    for (const group of byReleaseGroup.values()) {
      if (group.length < 2) continue
      for (const [a, b] of chainPairs(group)) {
        const key = pairKey(a.id, b.id)
        if (dismissedSet.has(key)) continue
        pairs.push({ tier: 1, a, b })
        tier1Keys.add(key)
      }
    }

    for (const cluster of clusterByTitle(artistAlbums)) {
      for (const [a, b] of chainPairs(cluster)) {
        const key = pairKey(a.id, b.id)
        if (dismissedSet.has(key) || tier1Keys.has(key)) continue
        pairs.push({ tier: 2, a, b })
      }
    }
  }

  pairs.sort((x, y) => x.tier - y.tier)

  const total = pairs.length
  const totalPages = Math.max(1, Math.ceil(total / limit))
  const shape = (row: AlbumRow) => ({
    id: row.id, title: row.title, release_year: row.release_year,
    image_path: row.image_path, artist_name: row.artist_name,
  })
  const pageItems = pairs.slice((page - 1) * limit, page * limit).map((p) => ({
    tier: p.tier, a: shape(p.a), b: shape(p.b),
  }))

  return c.json({ pairs: pageItems, pagination: { page, limit, total, totalPages } })
})

export default router

// server/src/services/spotifySearchScore.ts
// Experimental (#72). Gives every /search/spotify item the same kind of score
// library search ranks by (searchService.ts), so the frontend can mix the two
// into one list: EXACT_MATCH_SCORE when the name contains the query, else the
// pg_trgm similarity against the stop-word-filtered query when it clears
// FUZZY_SIMILARITY_THRESHOLD, else null ("not a name match"). Computed in
// Postgres with the library's own expressions rather than reimplemented in JS,
// so the two stay comparable. Tracks get only the contains check, as library
// track search does (findTrackIds); exactOnly (quoted) queries drop the fuzzy
// branch for everything.
import { Kysely, sql } from 'kysely'
import { db, Database } from '../db/database.js'
import { EXACT_MATCH_SCORE, FUZZY_SIMILARITY_THRESHOLD } from './searchService.js'
import { filterQuery } from './searchQuery.js'
import type { AnnotatedSpotifyResult } from './spotifyLibraryMatch.js'

export type WithScore<T> = T & { score: number | null }

export interface ScoredSpotifyResult {
  tracks: WithScore<AnnotatedSpotifyResult['tracks'][number]>[]
  albums: WithScore<AnnotatedSpotifyResult['albums'][number]>[]
  artists: WithScore<AnnotatedSpotifyResult['artists'][number]>[]
}

// Library search needs at least three characters of filtered query before it
// runs the fuzzy branch at all (handleSearchRequest), so the scorer does too.
const MIN_FUZZY_QUERY_LENGTH = 3

export function withNullScores(result: AnnotatedSpotifyResult): ScoredSpotifyResult {
  const none = <T>(items: T[]) => items.map((item) => ({ ...item, score: null }))
  return { tracks: none(result.tracks), albums: none(result.albums), artists: none(result.artists) }
}

export function createSpotifySearchScorer(db: Kysely<Database>) {
  return {
    async score(result: AnnotatedSpotifyResult, query: string, exactOnly: boolean): Promise<ScoredSpotifyResult> {
      const items = [
        ...result.artists.map((item) => ({ name: item.name, fuzzy: true })),
        ...result.albums.map((item) => ({ name: item.name, fuzzy: true })),
        ...result.tracks.map((item) => ({ name: item.name, fuzzy: false })),
      ]
      if (items.length === 0) return withNullScores(result)

      const filteredQ = filterQuery(query)
      const fuzzyAllowed = !exactOnly && filteredQ.length >= MIN_FUZZY_QUERY_LENGTH
      const names = items.map((i) => (typeof i.name === 'string' ? i.name : null))
      const fuzzy = items.map((i) => fuzzyAllowed && i.fuzzy)

      const { rows } = await sql<{ ord: number; score: number | string | null }>`
        SELECT t.ord::int AS ord,
          CASE
            WHEN t.name IS NULL THEN NULL
            WHEN f_unaccent(lower(t.name)) ILIKE f_unaccent(lower(${`%${query}%`})) THEN ${EXACT_MATCH_SCORE}::float8
            WHEN t.fuzzy AND similarity(f_unaccent(lower(t.name)), f_unaccent(lower(${filteredQ}))) >= ${FUZZY_SIMILARITY_THRESHOLD}
              THEN similarity(f_unaccent(lower(t.name)), f_unaccent(lower(${filteredQ})))
            ELSE NULL
          END AS score
        FROM unnest(${names}::text[], ${fuzzy}::boolean[]) WITH ORDINALITY AS t(name, fuzzy, ord)
      `.execute(db)

      const scores = new Array<number | null>(items.length).fill(null)
      for (const row of rows) scores[row.ord - 1] = row.score === null ? null : Number(row.score)

      let i = 0
      const take = <T>(list: T[]) => list.map((item) => ({ ...item, score: scores[i++] }))
      return { artists: take(result.artists), albums: take(result.albums), tracks: take(result.tracks) }
    },
  }
}

export const spotifySearchScorer = createSpotifySearchScorer(db)

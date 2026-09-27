import Anthropic from '@anthropic-ai/sdk'
import { betaTool } from '@anthropic-ai/sdk/helpers/beta/json-schema'
import { sql } from 'kysely'
import type { Context } from 'hono'
import { db } from '../db/database.js'
import { searchService } from './searchService.js'

const MAX_TOOL_ITERATIONS = 20
const OVERALL_TIMEOUT_MS = 45_000
const SIMILAR_ARTIST_MIN_SIMILARITY = 0.8

export interface GeneratePlaylistResult {
  trackIds: number[]
}

export async function generatePlaylist(
  prompt: string,
  size: number,
  c: Context,
  timeoutMs: number = OVERALL_TIMEOUT_MS,
): Promise<GeneratePlaylistResult> {
  const client = new Anthropic()
  // Every id search_library actually returned during this run — the only
  // ids finalize_playlist is allowed to include. Never trust the model's
  // own track_ids input directly; this closure is the enforcement point.
  const confirmedTrackIds = new Set<number>()
  let finalTrackIds: number[] = []

  const searchLibrary = betaTool({
    name: 'search_library',
    description: 'Search the P·Share library for tracks by title, optionally narrowed by artist. Returns up to 8 real matches with id, title, and artist. Only track ids returned by this tool may be used in finalize_playlist.',
    inputSchema: {
      type: 'object',
      properties: {
        title: { type: 'string', description: 'Song title to search for' },
        artist: { type: 'string', description: 'Artist name to narrow the search (optional, but recommended when known)' },
      },
      required: ['title'],
      additionalProperties: false,
    },
    run: async (input) => {
      const { title, artist } = input as { title: string; artist?: string }
      // Title and artist are separate fields (ANDed) rather than one free-
      // text query: a combined "artist - title" string can never match
      // either column on its own. The artist filter matches the track's
      // effective artist — its own artist_id if set, else its album's
      // artist_id (tracks can have a different artist than their album,
      // e.g. a compilation).
      let query = db
        .selectFrom('tracks as t')
        .innerJoin('albums as al', 'al.id', 't.album_id')
        .innerJoin('artists as aa', 'aa.id', 'al.artist_id')
        .leftJoin('artists as ta', 'ta.id', 't.artist_id')
        .select(['t.id'])
        .where('t.approved', '=', true)
        .where(sql<boolean>`f_unaccent(lower(t.title)) ILIKE f_unaccent(lower(${`%${title}%`}))`)
      if (artist) {
        query = query.where(sql<boolean>`f_unaccent(lower(coalesce(ta.name, aa.name))) ILIKE f_unaccent(lower(${`%${artist}%`}))`)
      }
      const rows = await query
        .orderBy('t.id')
        .limit(8)
        .execute()
      const ids = rows.map((r) => r.id)
      const tracks = await searchService.fetchTracksByIds(ids, c)
      for (const t of tracks) confirmedTrackIds.add(t.id)
      return JSON.stringify(tracks.map((t) => ({ id: t.id, title: t.title, artist: t.artist })))
    },
  })

  const getSimilarArtists = betaTool({
    name: 'get_similar_artists',
    description: "Given an artist name, returns similar artists already known within the P·Share library (only if the given artist is itself found in the library). Use this to pivot to a different real artist when your first guess isn't in the library.",
    inputSchema: {
      type: 'object',
      properties: { artist_name: { type: 'string' } },
      required: ['artist_name'],
      additionalProperties: false,
    },
    run: async (input) => {
      const { artist_name } = input as { artist_name: string }
      const artist = await db
        .selectFrom('artists')
        .select(['id', 'name'])
        .where(sql<boolean>`f_unaccent(lower(name)) = f_unaccent(lower(${artist_name}))`)
        .executeTakeFirst()
      if (!artist) return JSON.stringify({ found: false, similar: [] })

      const rows = await db
        .selectFrom('artist_relations as ar')
        .innerJoin('artists as ra', 'ra.id', 'ar.related_artist_id')
        .select(['ra.name', 'ar.similarity'])
        .where('ar.artist_id', '=', artist.id)
        .where('ar.kind', '=', 'similar')
        .where((eb) => eb.or([
          eb.and([eb('ar.source', '=', 'lastfm'), eb('ar.similarity', '>=', SIMILAR_ARTIST_MIN_SIMILARITY)]),
          eb('ar.force_show', '=', true),
        ]))
        .where('ar.is_hidden', '=', false)
        .orderBy('ar.similarity', 'desc')
        .limit(10)
        .execute()

      return JSON.stringify({ found: true, similar: rows.map((r) => ({ name: r.name, similarity: r.similarity })) })
    },
  })

  const getTags = betaTool({
    name: 'get_tags',
    description: 'Given an artist name already confirmed to exist in the library (via search_library or get_similar_artists), returns the tags applied to that artist. Use this to broaden or narrow within a tag once you have one confirmed match.',
    inputSchema: {
      type: 'object',
      properties: { artist_name: { type: 'string' } },
      required: ['artist_name'],
      additionalProperties: false,
    },
    run: async (input) => {
      const { artist_name } = input as { artist_name: string }
      const artist = await db
        .selectFrom('artists')
        .select('id')
        .where(sql<boolean>`f_unaccent(lower(name)) = f_unaccent(lower(${artist_name}))`)
        .executeTakeFirst()
      if (!artist) return JSON.stringify({ found: false, tags: [] })

      const rows = await db
        .selectFrom('artists_tags as at')
        .innerJoin('tags as t', 't.id', 'at.tag_id')
        .select('t.name')
        .where('at.artist_id', '=', artist.id)
        .execute()

      return JSON.stringify({ found: true, tags: rows.map((r) => r.name) })
    },
  })

  const finalizePlaylist = betaTool({
    name: 'finalize_playlist',
    description: 'Call this exactly once, when you are done selecting tracks (either you reached the requested count, or you have exhausted reasonable options). Submit the ordered list of track ids to use — only ids previously returned by search_library will be honored.',
    inputSchema: {
      type: 'object',
      properties: {
        track_ids: { type: 'array', items: { type: 'integer' }, description: 'Ordered track ids, only from ids previously returned by search_library' },
      },
      required: ['track_ids'],
      additionalProperties: false,
    },
    run: async (input) => {
      const { track_ids } = input as { track_ids: number[] }
      finalTrackIds = track_ids.filter((id) => confirmedTrackIds.has(id))
      return 'Playlist finalized.'
    },
  })

  const systemPrompt = `You are a music playlist curator for a personal music library called P·Share. A listener will give you a free-text prompt describing what they want to hear. Your job: propose real tracks that match the prompt, using your own music knowledge, but you may ONLY include a track if you have verified it exists in THIS library by calling search_library and seeing it in the results. Do not guess at track ids. Aim for ${size} confirmed tracks, but if you cannot find that many good matches, it is fine to finalize with fewer — never include a track you have not verified via search_library. When you are done, call finalize_playlist exactly once with your final ordered list.`

  // max_iterations bounds cost (the dominant driver); this wall-clock abort
  // is a secondary safety net so a slow/stuck run still returns to the caller
  // promptly — see docs/superpowers/specs/2026-09-27-ai-playlist-generator-design.md.
  // Aborting cancels the in-flight Anthropic request (no further billed turns
  // run with nothing waiting for them), and per the spec a timeout returns
  // whatever finalize_playlist already confirmed (possibly empty) rather than
  // erroring. Any non-timeout failure still rejects.
  const controller = new AbortController()
  const timeoutHandle = setTimeout(() => controller.abort(), timeoutMs)
  try {
    await client.beta.messages.toolRunner(
      {
        model: 'claude-sonnet-5',
        max_tokens: 4096,
        max_iterations: MAX_TOOL_ITERATIONS,
        system: systemPrompt,
        output_config: { effort: 'medium' },
        tools: [searchLibrary, getSimilarArtists, getTags, finalizePlaylist],
        messages: [{ role: 'user', content: `${prompt}\n\nTarget track count: ${size}.` }],
      },
      { signal: controller.signal },
    )
  } catch (err) {
    if (controller.signal.aborted) {
      return { trackIds: finalTrackIds }
    }
    throw err
  } finally {
    clearTimeout(timeoutHandle)
  }

  return { trackIds: finalTrackIds }
}

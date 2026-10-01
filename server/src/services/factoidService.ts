// server/src/services/factoidService.ts
// Turns one entity id into validated, cited factoid rows. Knows nothing about
// when it is called: the worker poller owns scheduling and spend caps.
// Spec: docs/superpowers/specs/2026-09-30-factoid-screensaver-design.md
import Anthropic from '@anthropic-ai/sdk'
import { betaTool } from '@anthropic-ai/sdk/helpers/beta/json-schema'
import { db } from '../db/database.js'
import { MAX_MB_TAGS_FOR_MODEL } from './playlistGeneratorService.js'
import { validateFactoids, MAX_FACTOID_LENGTH, type SubmittedFactoid } from './factoidValidation.js'
import { insertFactoids, existingTexts } from './factoidStore.js'

export const FACTOID_MODEL = 'claude-sonnet-5-5'
const MAX_TOOL_ITERATIONS = 8
const OVERALL_TIMEOUT_MS = 60_000
const MAX_SEARCHES = 5
const MAX_LIBRARY_ALBUMS_IN_PROMPT = 12

export interface EntityContext {
  kind: 'artist' | 'album'
  targetId: number
  name: string
  prompt: string
  tracklist: { id: number, title: string }[]
}

async function artistMbTags(artistId: number): Promise<string[]> {
  const rows = await db
    .selectFrom('artist_mb_tags as x')
    .innerJoin('mb_tags as mt', 'mt.id', 'x.tag_id')
    .select('mt.name')
    .where('x.artist_id', '=', artistId)
    .orderBy('x.tag_count', 'desc')
    .limit(MAX_MB_TAGS_FOR_MODEL)
    .execute()
  return rows.map((r) => r.name)
}

async function albumMbTags(albumId: number): Promise<string[]> {
  const rows = await db
    .selectFrom('album_mb_tags as x')
    .innerJoin('mb_tags as mt', 'mt.id', 'x.tag_id')
    .select('mt.name')
    .where('x.album_id', '=', albumId)
    .orderBy('x.tag_count', 'desc')
    .limit(MAX_MB_TAGS_FOR_MODEL)
    .execute()
  return rows.map((r) => r.name)
}

export async function buildArtistContext(artistId: number): Promise<EntityContext | null> {
  const artist = await db
    .selectFrom('artists').select(['id', 'name', 'wikipedia'])
    .where('id', '=', artistId).executeTakeFirst()
  if (!artist) return null

  const tags = await artistMbTags(artistId)
  const albums = await db
    .selectFrom('albums').select(['title', 'release_year'])
    .where('artist_id', '=', artistId)
    .orderBy('release_year', 'asc')
    .limit(MAX_LIBRARY_ALBUMS_IN_PROMPT)
    .execute()

  const lines = [`Artist: ${artist.name}`]
  if (tags.length > 0) lines.push(`Genres and styles: ${tags.join(', ')}`)
  if (albums.length > 0) {
    lines.push(`Albums held in this library: ${albums.map((a) => a.release_year ? `${a.title} (${a.release_year})` : a.title).join('; ')}`)
  }
  if (artist.wikipedia) lines.push(`Background already known:\n${artist.wikipedia}`)

  return { kind: 'artist', targetId: artistId, name: artist.name, prompt: lines.join('\n'), tracklist: [] }
}

export async function buildAlbumContext(albumId: number): Promise<EntityContext | null> {
  const album = await db
    .selectFrom('albums').select(['id', 'title', 'release_year', 'artist_id', 'wikipedia'])
    .where('id', '=', albumId).executeTakeFirst()
  if (!album) return null

  // albums.artist_id has no FK, so the artist row may be gone. An orphaned
  // album must still produce a usable context: throwing here would burn all
  // three retry attempts on an entity that can never succeed.
  const artist = album.artist_id
    ? await db.selectFrom('artists').select(['name']).where('id', '=', album.artist_id).executeTakeFirst()
    : undefined

  const tracks = await db
    .selectFrom('tracks').select(['id', 'title', 'track_number'])
    .where('album_id', '=', albumId)
    .orderBy('track_number', 'asc')
    .execute()
  const tags = await albumMbTags(albumId)

  const lines = [`Album: ${album.title}`]
  if (artist?.name) lines.push(`Artist: ${artist.name}`)
  if (album.release_year) lines.push(`Released: ${album.release_year}`)
  if (tags.length > 0) lines.push(`Genres and styles: ${tags.join(', ')}`)
  if (tracks.length > 0) {
    lines.push(`Tracklist:\n${tracks.map((t, i) => `${t.track_number ?? i + 1}. ${t.title}`).join('\n')}`)
  }
  if (album.wikipedia) lines.push(`Background already known:\n${album.wikipedia}`)

  return {
    kind: 'album',
    targetId: albumId,
    name: album.title,
    prompt: lines.join('\n'),
    tracklist: tracks.map((t) => ({ id: t.id, title: t.title })),
  }
}

// Texts the validator must treat as already-published. Track-scoped factoids
// are keyed by TRACK id, so an album run has to dedupe against every track on
// the album as well as the album itself, or "Research again" would re-insert
// the same track facts. An artist run only ever produces artist facts.
export async function existingTextsForRun(
  kind: 'artist' | 'album',
  targetId: number,
  tracklist: { id: number, title: string }[],
): Promise<string[]> {
  const texts = await existingTexts(kind, targetId)
  if (kind === 'album' && tracklist.length > 0) {
    const rows = await db
      .selectFrom('factoids')
      .select('text')
      .where('kind', '=', 'track')
      .where('target_id', 'in', tracklist.map((t) => t.id))
      .execute()
    texts.push(...rows.map((r) => r.text))
  }
  return texts
}

// Collects hosts from web_search_tool_result blocks. On a search error the
// API returns HTTP 200 with `content` as an error OBJECT rather than a list,
// so the Array.isArray guard is load-bearing, not defensive noise: without it
// this throws and every run with an exhausted search budget fails.
export function collectSearchHosts(content: unknown[], into: Set<string>): void {
  if (!Array.isArray(content)) return
  for (const block of content) {
    const b = block as { type?: string, content?: unknown }
    if (b?.type !== 'web_search_tool_result' || !Array.isArray(b.content)) continue
    for (const result of b.content) {
      const url = (result as { url?: unknown })?.url
      if (typeof url !== 'string') continue
      try {
        into.add(new URL(url).hostname.toLowerCase())
      } catch {
        // A result we cannot parse simply cites nothing.
      }
    }
  }
}

// One log line per generation. It always prints (not only when something was
// discarded) because the failure it exists to expose prints nothing otherwise:
// if the tool-runner loop yields turns without their web_search_tool_result
// blocks, searchHosts stays empty, every citation is discarded as invented, the
// run records "empty", and the worker keeps spending on a feature producing zero.
export function summarizeRun(r: {
  kind: 'artist' | 'album'
  targetId: number
  name: string
  searchHosts: number
  submitted: number
  accepted: number
  rejected: string[]
}): string {
  let line = `[factoids] ${r.kind} ${r.targetId} (${r.name}): search hosts=${r.searchHosts}, submitted=${r.submitted}, accepted=${r.accepted}, discarded=${r.rejected.length}`
  if (r.rejected.length > 0) line += `: ${r.rejected.join('; ')}`
  if (r.submitted > 0 && r.searchHosts === 0) {
    line += ' (WARNING: the model submitted facts but no web search results were seen, so every citation was discarded; check that the tool runner yields web_search_tool_result blocks)'
  }
  return line
}

const SYSTEM_PROMPT = `You are a music researcher for a personal music library called P·Share. You will be given one artist or one album. Find genuinely interesting, specific facts about it and submit them by calling the submit_factoids tool exactly once.

What makes a good factoid:
- A specific story: how a part was recorded, where a sample came from, why a title is what it is, an unexpected player on the session, a happy accident that made the record.
- Something a casual listener would not know and would enjoy being told.

What to avoid:
- Generic biography, formation dates, chart positions, sales figures, award lists.
- Anything you cannot find a real source for. Omit it rather than softening it; an unsourced claim will be thrown away regardless, so submitting one only wastes effort.

Rules:
- Use the web_search tool to find and verify facts. Every factoid must set source_url to a page that your search actually returned. Do not construct, guess, or recall a URL.
- Keep each factoid under ${MAX_FACTOID_LENGTH} characters. One fact per factoid, written as a plain sentence a screen can show on its own.
- Never use an em-dash. Use a comma, colon, or hyphen instead.
- For an album you may also submit facts about individual songs on it: set scope to "track" and track_title to the exact title from the tracklist you were given.
- When you are done, call submit_factoids exactly once. If you found nothing worth saying, call it with an empty list.`

export async function generateFactoidsFor(
  kind: 'artist' | 'album',
  targetId: number,
  generationId: number,
): Promise<{ status: 'ok' | 'empty', count: number }> {
  const context = kind === 'artist' ? await buildArtistContext(targetId) : await buildAlbumContext(targetId)
  if (!context) return { status: 'empty', count: 0 }

  const client = new Anthropic()
  const searchHosts = new Set<string>()
  let submitted: SubmittedFactoid[] = []

  const submitFactoids = betaTool({
    name: 'submit_factoids',
    description: 'Submit your final list of factoids. Call this exactly once, at the end. Every factoid must cite a source_url from a page web_search actually returned.',
    inputSchema: {
      type: 'object',
      properties: {
        factoids: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              text: { type: 'string', description: `The fact, one sentence, under ${MAX_FACTOID_LENGTH} characters, no em-dashes` },
              source_url: { type: 'string', description: 'An https URL that web_search returned' },
              source_title: { type: 'string', description: 'The page or publication title' },
              scope: { type: 'string', enum: ['artist', 'album', 'track'] },
              track_title: { type: 'string', description: 'Required when scope is "track": the exact title from the given tracklist' },
            },
            required: ['text', 'source_url', 'scope'],
            additionalProperties: false,
          },
        },
      },
      required: ['factoids'],
      additionalProperties: false,
    },
    run: async (input) => {
      submitted = (input as { factoids: SubmittedFactoid[] }).factoids ?? []
      return 'Factoids received.'
    },
  })

  const controller = new AbortController()
  const timeoutHandle = setTimeout(() => controller.abort(), OVERALL_TIMEOUT_MS)
  try {
    // tool_choice is deliberately left at the default `auto`: forced tool use
    // ({type:'any'} or {type:'tool'}) returned HTTP 400 on claude-opus-5-5 (not retested on sonnet). The
    // system prompt names submit_factoids instead.
    const runner = client.beta.messages.toolRunner({
      model: FACTOID_MODEL,
      max_tokens: 4096,
      max_iterations: MAX_TOOL_ITERATIONS,
      system: SYSTEM_PROMPT,
      // effort is set explicitly: this model defaults to `medium`, and this is
      // recall-and-summarize work, not reasoning.
      output_config: { effort: 'low' },
      tools: [
        submitFactoids,
        // No code_execution alongside this: the _20260209 variant already
        // runs code execution internally.
        { type: 'web_search_20260209', name: 'web_search', max_uses: MAX_SEARCHES } as never,
      ],
      messages: [{ role: 'user', content: context.prompt }],
    }, { signal: controller.signal })

    // Iterating (rather than a bare `await runner`) is what exposes each turn's
    // content, so search-result hosts can be collected for the citation check.
    // pause_turn needs no handling here: this SDK (BetaToolRunner, 0.128) sends a
    // paused turn back unchanged and continues it itself. Older SDKs (0.110) did
    // not, and a manual pushMessages() here was once dead code that claimed
    // otherwise. factoidService.fakeApi.test.ts pins the resume behavior, so an
    // SDK change that stops it fails a test instead of silently truncating runs.
    for await (const message of runner) {
      collectSearchHosts(message.content as unknown[], searchHosts)
    }
  } catch (err) {
    if (!controller.signal.aborted) throw err
    // On timeout, keep whatever was already submitted rather than erroring,
    // matching how playlistGeneratorService returns its confirmed ids.
  } finally {
    clearTimeout(timeoutHandle)
  }

  const { accepted, rejected } = validateFactoids(submitted, {
    kind,
    targetId,
    searchHosts,
    tracklist: context.tracklist,
    existingTexts: await existingTextsForRun(kind, targetId, context.tracklist),
  })
  console.log(summarizeRun({
    kind,
    targetId,
    name: context.name,
    searchHosts: searchHosts.size,
    submitted: Array.isArray(submitted) ? submitted.length : 0,
    accepted: accepted.length,
    rejected: rejected.map((r) => r.reason),
  }))

  const count = await insertFactoids(accepted, FACTOID_MODEL, generationId)
  return { status: count > 0 ? 'ok' : 'empty', count }
}

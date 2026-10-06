#!/usr/bin/env node
import 'dotenv/config'

/**
 * THROWAWAY PROBE (not wired into the worker): what would factoid generation
 * cost through the Message Batches API?
 *
 *   npx tsx scripts/try-factoids-batch.ts [--albums 5] [--artists 5]
 *
 * Picks the most-played albums/artists in the connected DB, submits ONE batch
 * with one flattened request per entity (server-side web_search, then a single
 * submit_factoids call that ends the turn), polls to completion, validates with
 * the real validator, and prints usage + cost. Writes NOTHING to the database.
 *
 * THIS MAKES REAL, BILLED API CALLS.
 */
import Anthropic from '@anthropic-ai/sdk'
import { sql } from 'kysely'
import { db } from '../src/db/database.js'
import {
  FACTOID_MODEL, SYSTEM_PROMPT, buildAlbumContext, buildArtistContext,
  collectSearchHosts, addUsage, emptyUsage, type EntityContext,
} from '../src/services/factoidService.js'
import { validateFactoids, MAX_FACTOID_LENGTH, type SubmittedFactoid } from '../src/services/factoidValidation.js'

const argNum = (flag: string, dflt: number) => {
  const i = process.argv.indexOf(flag)
  return i >= 0 ? Number(process.argv[i + 1]) : dflt
}
const nAlbums = argNum('--albums', 5)
const nArtists = argNum('--artists', 5)

// Standard rates for claude-sonnet-5-5 ($/MTok); batch is 50% of these on tokens.
const STD = { input: 2, output: 10 }
const SEARCH_FEE = 0.01 // $10 per 1,000 searches; NOT confirmed discounted under batch

const SUBMIT_TOOL = {
  name: 'submit_factoids',
  description: 'Submit your final list of factoids. Call this exactly once, at the end. Every factoid must cite a source_url from a page web_search actually returned.',
  input_schema: {
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
}

async function pickIds(kind: 'album' | 'artist', n: number): Promise<number[]> {
  if (n <= 0) return []
  const col = kind === 'album' ? 'album_id' : 'artist_id'
  const table = kind === 'album' ? 'albums' : 'artists'
  const { rows } = await sql<{ id: number }>`
    SELECT t.id FROM ${sql.table(table)} t
      JOIN (SELECT ${sql.ref(col)} AS id, COUNT(*) c FROM logs WHERE ${sql.ref(col)} IS NOT NULL GROUP BY 1) p ON p.id = t.id
     ORDER BY p.c DESC LIMIT ${n}`.execute(db)
  if (rows.length >= n) return rows.map((r) => r.id)
  const { rows: extra } = await sql<{ id: number }>`
    SELECT id FROM ${sql.table(table)} ORDER BY random() LIMIT ${n - rows.length}`.execute(db)
  return [...rows, ...extra].map((r) => r.id)
}

async function main() {
  const { rows: [conn] } = await sql<{ db: string }>`select current_database() as db`.execute(db)
  console.log(`Database: ${conn.db} (read-only probe)\nModel: ${FACTOID_MODEL}\n`)

  const contexts = new Map<string, EntityContext>()
  for (const id of await pickIds('album', nAlbums)) {
    const c = await buildAlbumContext(id)
    if (c) contexts.set(`album-${id}`, c)
  }
  for (const id of await pickIds('artist', nArtists)) {
    const c = await buildArtistContext(id)
    if (c) contexts.set(`artist-${id}`, c)
  }
  console.log(`Entities (${contexts.size}): ${[...contexts].map(([k, c]) => `${k} "${c.name}"`).join(', ')}\n`)

  const client = new Anthropic()
  const batch = await client.messages.batches.create({
    requests: [...contexts].map(([custom_id, c]) => ({
      custom_id,
      params: {
        model: FACTOID_MODEL,
        max_tokens: 4096,
        system: SYSTEM_PROMPT,
        output_config: { effort: 'low' },
        tools: [
          SUBMIT_TOOL,
          { type: 'web_search_20260209', name: 'web_search', max_uses: 5 },
        ],
        messages: [{ role: 'user', content: c.prompt }],
      } as never,
    })),
  })
  console.log(`Batch ${batch.id} submitted at ${new Date().toISOString()}`)

  const started = Date.now()
  let b = batch
  while (b.processing_status !== 'ended') {
    await new Promise((r) => setTimeout(r, 30_000))
    b = await client.messages.batches.retrieve(batch.id)
    console.log(`  ${Math.round((Date.now() - started) / 1000)}s: ${JSON.stringify(b.request_counts)}`)
  }
  console.log(`Batch ended after ${Math.round((Date.now() - started) / 1000)}s\n`)

  const total = emptyUsage()
  let accepted = 0, submittedN = 0, paused = 0, failed = 0
  for await (const r of await client.messages.batches.results(batch.id)) {
    const c = contexts.get(r.custom_id)!
    if (r.result.type !== 'succeeded') {
      failed++
      console.log(`[${r.custom_id}] ${r.result.type}${r.result.type === 'errored' ? ': ' + JSON.stringify(r.result.error) : ''}`)
      continue
    }
    const msg = r.result.message
    const usage = emptyUsage()
    addUsage(usage, msg.usage)
    for (const k of ['turns', 'input', 'output', 'cacheRead', 'cacheWrite', 'searches'] as const) total[k] += usage[k]

    const hosts = new Set<string>()
    collectSearchHosts(msg.content as unknown[], hosts)
    const tool = (msg.content as { type: string, name?: string, input?: unknown }[])
      .find((b) => b.type === 'tool_use' && b.name === 'submit_factoids')
    const submitted = ((tool?.input as { factoids?: SubmittedFactoid[] })?.factoids) ?? []
    if (msg.stop_reason === 'pause_turn') paused++

    const { accepted: ok, rejected } = validateFactoids(submitted, {
      kind: c.kind, targetId: c.targetId, searchHosts: hosts, tracklist: c.tracklist, existingTexts: [],
    })
    accepted += ok.length
    submittedN += submitted.length
    console.log(`[${r.custom_id}] "${c.name}" stop=${msg.stop_reason} searches=${usage.searches} hosts=${hosts.size} tokens in=${usage.input} out=${usage.output} submitted=${submitted.length} accepted=${ok.length} discarded=${rejected.length}`)
    for (const f of ok) console.log(`    - ${f.text}`)
    for (const x of rejected) console.log(`    x ${x.reason}`)
  }

  const n = contexts.size - failed || 1
  const stdTok = (total.input * STD.input + total.output * STD.output) / 1e6
  const batchTok = stdTok / 2
  const search = total.searches * SEARCH_FEE
  console.log(`\n== Totals (${contexts.size - failed}/${contexts.size} succeeded, ${paused} paused) ==`)
  console.log(`tokens in=${total.input} out=${total.output} cache_read=${total.cacheRead} cache_write=${total.cacheWrite} searches=${total.searches}`)
  console.log(`submitted=${submittedN} accepted=${accepted}`)
  console.log(`token cost  standard=$${stdTok.toFixed(4)}  batch=$${batchTok.toFixed(4)}`)
  console.log(`search fee  $${search.toFixed(4)} (assumed undiscounted)`)
  console.log(`per entity  standard=$${((stdTok + search) / n).toFixed(4)}  batch=$${((batchTok + search) / n).toFixed(4)}  (batch if search also halved: $${((batchTok + search / 2) / n).toFixed(4)})`)
}

main()
  .catch((err) => { console.error(err); process.exitCode = 1 })
  .finally(() => db.destroy())

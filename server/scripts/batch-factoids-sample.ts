#!/usr/bin/env node
import 'dotenv/config'

/**
 * MEASUREMENT PROBE for a factoid backfill (not wired into the worker).
 *
 * Reads the play history, picks N albums and N artists that have no factoid
 * ledger row (half the most recently played, half the most played of all time),
 * submits ONE Message Batch with one flattened request per entity (server-side
 * web_search, then a single submit_factoids call), polls to completion,
 * validates with the real validator, and reports cost and yield so a backfill
 * can be sized. WRITES NOTHING to any database: results go to a JSON file.
 *
 *   # Preview the selection and the estimate. Spends nothing.
 *   npx tsx --env-file=.env --env-file=<prod-readonly.env> scripts/batch-factoids-sample.ts
 *   # Submit the batch (REAL, BILLED API CALLS).
 *   ... scripts/batch-factoids-sample.ts --submit [--albums 50] [--artists 50] [--out DIR]
 *   # Pick a running/finished batch back up (e.g. after Ctrl-C while polling).
 *   ... scripts/batch-factoids-sample.ts --resume <batchId> --meta <file.meta.json>
 *
 * It refuses to run unless the connection is read-only. Against production,
 * connect with `?options=-c%20default_transaction_read_only%3Don` on BEMUSED_DB.
 */
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import Anthropic from '@anthropic-ai/sdk'
import { sql } from 'kysely'
import { db } from '../src/db/database.js'
import {
  FACTOID_MODEL, SYSTEM_PROMPT, MAX_SEARCHES, submitFactoidsTool, buildAlbumContext, buildArtistContext,
  collectSearchHosts, addUsage, emptyUsage, type EntityContext,
} from '../src/services/factoidService.js'
import { SKIPPED_ARTIST_NAMES } from '../src/services/factoidLedger.js'
import { validateFactoids, type SubmittedFactoid } from '../src/services/factoidValidation.js'

type Kind = 'album' | 'artist'
type Bucket = 'recent' | 'historic'
interface Picked { customId: string, kind: Kind, id: number, name: string, bucket: Bucket, plays: number }

const flag = (name: string) => process.argv.includes(name)
const arg = (name: string) => { const i = process.argv.indexOf(name); return i >= 0 ? process.argv[i + 1] : undefined }
const nAlbums = Number(arg('--albums') ?? 50)
const nArtists = Number(arg('--artists') ?? 50)
const outDir = arg('--out') ?? path.join(process.env.CLAUDE_JOB_DIR ?? os.tmpdir(), 'tmp')
const direct = flag('--direct')

// Rates for claude-sonnet-5-5 ($/MTok). Batch is 50% of standard on tokens. The
// docs do not say whether the per-search fee is discounted, so both are reported.
const STD = { input: 2, output: 10, cacheRead: 0.2, cacheWrite: 2.5 }
const SEARCH_FEE = 0.01

// Albums/artists with a play but no ledger row. `recent` ranks by last play,
// `historic` by play count; the second pass skips what the first took.
async function pickOpen(kind: Kind, n: number): Promise<Picked[]> {
  if (n <= 0) return []
  const col = kind === 'album' ? 'album_id' : 'artist_id'
  const table = kind === 'album' ? 'albums' : 'artists'
  const nameCol = kind === 'album' ? 'title' : 'name'
  const skip = kind === 'artist'
    ? sql`AND lower(btrim(t.name)) NOT IN (${sql.join(SKIPPED_ARTIST_NAMES)})`
    : sql``
  const recentN = Math.ceil(n / 2)
  const rank = async (orderBy: 'last_played' | 'plays', limit: number, exclude: number[]) => {
    const { rows } = await sql<{ id: number, name: string, plays: string }>`
      SELECT t.id, t.${sql.ref(nameCol)} AS name, p.plays
        FROM (SELECT l.${sql.ref(col)} AS id, MAX(l.created_at) AS last_played, COUNT(*) AS plays
                FROM logs l WHERE l.action = 'stream' AND l.${sql.ref(col)} IS NOT NULL GROUP BY 1) p
        JOIN ${sql.table(table)} t ON t.id = p.id
       WHERE NOT EXISTS (SELECT 1 FROM factoid_generations g WHERE g.kind = ${kind} AND g.target_id = p.id)
         AND t.id <> ALL(${exclude}::int[])
         ${skip}
       ORDER BY ${sql.ref(orderBy)} DESC, t.id
       LIMIT ${limit}`.execute(db)
    return rows
  }
  const recent = await rank('last_played', recentN, [])
  const historic = await rank('plays', n - recentN, recent.map((r) => r.id))
  const toPicked = (rows: typeof recent, bucket: Bucket): Picked[] => rows.map((r) => ({
    customId: `${kind}-${r.id}`, kind, id: r.id, name: r.name, bucket, plays: Number(r.plays),
  }))
  return [...toPicked(recent, 'recent'), ...toPicked(historic, 'historic')]
}

const openCount = async (kind: Kind): Promise<number> => {
  const col = kind === 'album' ? 'album_id' : 'artist_id'
  const table = kind === 'album' ? 'albums' : 'artists'
  const skip = kind === 'artist' ? sql`AND lower(btrim(t.name)) NOT IN (${sql.join(SKIPPED_ARTIST_NAMES)})` : sql``
  const { rows } = await sql<{ n: string }>`
    SELECT COUNT(*) AS n FROM ${sql.table(table)} t
     WHERE EXISTS (SELECT 1 FROM logs l WHERE l.action = 'stream' AND l.${sql.ref(col)} = t.id)
       AND NOT EXISTS (SELECT 1 FROM factoid_generations g WHERE g.kind = ${kind} AND g.target_id = t.id)
       ${skip}`.execute(db)
  return Number(rows[0]?.n ?? 0)
}

interface Row {
  customId: string, kind: Kind, id: number, name: string, bucket: Bucket
  status: 'succeeded' | 'errored' | 'expired' | 'canceled'
  stopReason?: string, searches: number
  usage: { input: number, output: number, cacheRead: number, cacheWrite: number }
  submitted: number, accepted: { text: string, sourceUrl: string, sourceTitle: string | null }[], rejected: string[]
  costBatchTokens: number, costStdTokens: number
}

const tokenCosts = (u: Row['usage']) => {
  const std = (u.input * STD.input + u.output * STD.output + u.cacheRead * STD.cacheRead + u.cacheWrite * STD.cacheWrite) / 1e6
  return { std, batch: std / 2 }
}

const money = (n: number) => `$${n.toFixed(4)}`

function report(label: string, rows: Row[]) {
  if (rows.length === 0) return
  const ok = rows.filter((r) => r.status === 'succeeded')
  const paused = ok.filter((r) => r.stopReason === 'pause_turn').length
  const facts = ok.reduce((n, r) => n + r.accepted.length, 0)
  const zero = ok.filter((r) => r.accepted.length === 0 && r.stopReason !== 'pause_turn').length
  const searches = ok.reduce((n, r) => n + r.searches, 0)
  const batchTok = ok.reduce((n, r) => n + r.costBatchTokens, 0)
  const stdTok = ok.reduce((n, r) => n + r.costStdTokens, 0)
  const cacheR = ok.reduce((n, r) => n + r.usage.cacheRead, 0)
  const allIn = ok.reduce((n, r) => n + r.usage.input + r.usage.cacheRead + r.usage.cacheWrite, 0)
  const per = (x: number) => (ok.length ? x / ok.length : 0)
  const perFact = (x: number) => (facts ? x / facts : 0)
  const batchFull = batchTok + searches * SEARCH_FEE
  const batchHalfSearch = batchTok + searches * SEARCH_FEE / 2
  const stdFull = stdTok + searches * SEARCH_FEE
  console.log(`\n-- ${label}: ${ok.length}/${rows.length} succeeded, ${paused} paused, ${zero} zero-yield (${ok.length ? Math.round(100 * zero / ok.length) : 0}%), ${facts} facts (${per(facts).toFixed(1)}/entity), ${per(searches).toFixed(1)} searches/entity, cache ${allIn ? Math.round(100 * cacheR / allIn) : 0}% of input`)
  console.log(`   per entity   batch ${money(per(batchFull))} (search fee halved too: ${money(per(batchHalfSearch))})   standard-equivalent ${money(per(stdFull))}`)
  console.log(`   per fact     batch ${money(perFact(batchFull))} (halved: ${money(perFact(batchHalfSearch))})   standard-equivalent ${money(perFact(stdFull))}`)
}

async function main() {
  const { rows: [conn] } = await sql<{ db: string, ro: string }>`SELECT current_database() AS db, current_setting('default_transaction_read_only') AS ro`.execute(db)
  if (conn.ro !== 'on') {
    console.error('Refusing to run: this connection is not read-only. Add ?options=-c%20default_transaction_read_only%3Don to BEMUSED_DB.')
    process.exit(2)
  }
  console.log(`Database: ${conn.db} (read-only confirmed)\nModel: ${FACTOID_MODEL}\nWeb search: ${direct ? 'direct calls (allowed_callers: ["direct"])' : 'default (dynamic filtering via code execution)'}\n`)

  const client = new Anthropic()
  fs.mkdirSync(outDir, { recursive: true })
  const stamp = new Date().toISOString().replace(/[:.]/g, '-')

  let batchId = arg('--resume')
  let picked: Picked[]
  let metaPath = arg('--meta') ?? path.join(outDir, `batch-sample-${stamp}.meta.json`)

  if (batchId) {
    picked = (JSON.parse(fs.readFileSync(metaPath, 'utf8')) as { picked: Picked[] }).picked
    console.log(`Resuming batch ${batchId} (${picked.length} entities)`)
  } else {
    // --ids-from reruns exactly the entities of an earlier results file, for a
    // like-for-like comparison (e.g. dynamic filtering vs --direct).
    const idsFrom = arg('--ids-from')
    picked = idsFrom
      ? (JSON.parse(fs.readFileSync(idsFrom, 'utf8')) as Picked[]).map((r) => ({
          customId: r.customId, kind: r.kind, id: r.id, name: r.name, bucket: r.bucket, plays: 0,
        }))
      : [...(await pickOpen('album', nAlbums)), ...(await pickOpen('artist', nArtists))]
    const by = (k: Kind, b: Bucket) => picked.filter((p) => p.kind === k && p.bucket === b).length
    console.log(`Selected ${picked.length}: albums ${by('album', 'recent')} recent + ${by('album', 'historic')} historic, artists ${by('artist', 'recent')} recent + ${by('artist', 'historic')} historic`)
    for (const p of picked) console.log(`  ${p.customId.padEnd(14)} ${p.bucket.padEnd(8)} plays=${String(p.plays).padStart(4)}  ${p.name}`)
    const [albumsOpen, artistsOpen] = [await openCount('album'), await openCount('artist')]
    console.log(`\nBacklog with plays and no ledger row: ${albumsOpen} albums + ${artistsOpen} artists = ${albumsOpen + artistsOpen} entities`)
    if (!flag('--submit')) {
      console.log('\nPreview only. Re-run with --submit to send the batch (billed).')
      return
    }

    const contexts = new Map<string, EntityContext>()
    for (const p of picked) {
      const c = p.kind === 'album' ? await buildAlbumContext(p.id) : await buildArtistContext(p.id)
      if (c) contexts.set(p.customId, c)
    }
    picked = picked.filter((p) => contexts.has(p.customId))
    const batch = await client.messages.batches.create({
      requests: picked.map((p) => {
        const tool = submitFactoidsTool(p.kind)
        return {
          custom_id: p.customId,
          params: {
            model: FACTOID_MODEL,
            max_tokens: 4096,
            system: [{ type: 'text', text: SYSTEM_PROMPT, cache_control: { type: 'ephemeral' } }],
            output_config: { effort: 'low' },
            tools: [
              { name: tool.name, description: tool.description, input_schema: tool.inputSchema },
              // On web_search_20260209 the model calls search from inside code
              // execution by default (dynamic filtering). --direct sets
              // allowed_callers to ["direct"] to call it straight, which avoids the
              // invalid_tool_input errors seen with the wrapped call shape.
              { type: 'web_search_20260209', name: 'web_search', max_uses: MAX_SEARCHES, ...(direct ? { allowed_callers: ['direct'] } : {}) },
            ],
            messages: [{ role: 'user', content: contexts.get(p.customId)!.prompt }],
          } as never,
        }
      }),
    })
    batchId = batch.id
    fs.writeFileSync(metaPath, JSON.stringify({ batchId, submittedAt: new Date().toISOString(), picked }, null, 2))
    console.log(`\nBatch ${batchId} submitted ${new Date().toISOString()} (${picked.length} requests)\nMeta: ${metaPath}\nIf this process stops, resume with: --resume ${batchId} --meta ${metaPath}`)
  }

  const started = Date.now()
  let b = await client.messages.batches.retrieve(batchId)
  while (b.processing_status !== 'ended') {
    await new Promise((r) => setTimeout(r, 30_000))
    b = await client.messages.batches.retrieve(batchId)
    console.log(`  ${Math.round((Date.now() - started) / 1000)}s: ${JSON.stringify(b.request_counts)}`)
  }
  console.log(`Batch ended (polled ${Math.round((Date.now() - started) / 1000)}s)\n`)

  const byId = new Map(picked.map((p) => [p.customId, p]))
  const rows: Row[] = []
  for await (const r of await client.messages.batches.results(batchId)) {
    const p = byId.get(r.custom_id)
    if (!p) continue
    const base = { customId: p.customId, kind: p.kind, id: p.id, name: p.name, bucket: p.bucket }
    if (r.result.type !== 'succeeded') {
      rows.push({ ...base, status: r.result.type, searches: 0, usage: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 }, submitted: 0, accepted: [], rejected: [JSON.stringify((r.result as { error?: unknown }).error ?? r.result.type)], costBatchTokens: 0, costStdTokens: 0 })
      continue
    }
    const msg = r.result.message
    const u = emptyUsage()
    addUsage(u, msg.usage)
    const usage = { input: u.input, output: u.output, cacheRead: u.cacheRead, cacheWrite: u.cacheWrite }
    const hosts = new Set<string>()
    collectSearchHosts(msg.content as unknown[], hosts)
    const call = (msg.content as { type: string, name?: string, input?: unknown }[]).find((x) => x.type === 'tool_use' && x.name === 'submit_factoids')
    const submitted = ((call?.input as { factoids?: SubmittedFactoid[] } | null)?.factoids) ?? []
    const ctx = p.kind === 'album' ? await buildAlbumContext(p.id) : await buildArtistContext(p.id)
    const { accepted, rejected } = validateFactoids(submitted, {
      kind: p.kind, targetId: p.id, searchHosts: hosts, tracklist: ctx?.tracklist ?? [], existingTexts: [],
    })
    const c = tokenCosts(usage)
    rows.push({
      ...base, status: 'succeeded', stopReason: msg.stop_reason ?? undefined, searches: u.searches, usage,
      submitted: submitted.length,
      accepted: accepted.map((a) => ({ text: a.text, sourceUrl: a.sourceUrl, sourceTitle: a.sourceTitle })),
      rejected: rejected.map((x) => x.reason), costBatchTokens: c.batch, costStdTokens: c.std,
    })
  }

  const resultsPath = path.join(outDir, `batch-sample-${batchId}.results.json`)
  fs.writeFileSync(resultsPath, JSON.stringify(rows, null, 2))
  console.log(`Per-entity results: ${resultsPath}`)

  // Count failed searches directly: errored searches are not billed, so the
  // usage block's search count hides them.
  let errored = 0, okSearch = 0, reqsWithError = 0
  for await (const r of await client.messages.batches.results(batchId)) {
    if (r.result.type !== 'succeeded') continue
    let had = false
    for (const b of r.result.message.content as { type: string, content?: unknown }[]) {
      if (b.type !== 'web_search_tool_result') continue
      if (Array.isArray(b.content)) okSearch++
      else { errored++; had = true }
    }
    if (had) reqsWithError++
  }
  console.log(`Web search calls: ${okSearch} ok, ${errored} errored (${okSearch + errored ? Math.round(100 * errored / (okSearch + errored)) : 0}%); ${reqsWithError} of ${rows.length} requests had at least one error`)

  const stops: Record<string, number> = {}
  for (const r of rows) { const k = r.status === 'succeeded' ? (r.stopReason ?? '?') : r.status; stops[k] = (stops[k] ?? 0) + 1 }
  console.log(`Outcomes: ${JSON.stringify(stops)}`)

  report('ALL', rows)
  for (const k of ['album', 'artist'] as const) report(k.toUpperCase(), rows.filter((r) => r.kind === k))
  for (const bk of ['recent', 'historic'] as const) report(`bucket ${bk}`, rows.filter((r) => r.bucket === bk))
  for (const k of ['album', 'artist'] as const) for (const bk of ['recent', 'historic'] as const) report(`${k} ${bk}`, rows.filter((r) => r.kind === k && r.bucket === bk))

  // Projection: average per-entity cost by kind times the open backlog.
  const [albumsOpen, artistsOpen] = [await openCount('album'), await openCount('artist')]
  const avg = (k: Kind, f: (r: Row) => number) => {
    const ok = rows.filter((r) => r.kind === k && r.status === 'succeeded')
    return ok.length ? ok.reduce((n, r) => n + f(r), 0) / ok.length : 0
  }
  const proj = (f: (r: Row) => number) => albumsOpen * avg('album', f) + artistsOpen * avg('artist', f)
  console.log(`\n== Backfill projection for ${albumsOpen} albums + ${artistsOpen} artists ==`)
  console.log(`   batch, search fee undiscounted   ${money(proj((r) => r.costBatchTokens + r.searches * SEARCH_FEE))}`)
  console.log(`   batch, search fee also halved    ${money(proj((r) => r.costBatchTokens + r.searches * SEARCH_FEE / 2))}`)
  console.log(`   standard-equivalent (interactive) ${money(proj((r) => r.costStdTokens + r.searches * SEARCH_FEE))}`)
}

main()
  .catch((err) => { console.error(err); process.exitCode = 1 })
  .finally(() => db.destroy())

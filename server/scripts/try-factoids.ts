#!/usr/bin/env node
import 'dotenv/config'

/**
 * Supervised one-off: research ONE album or artist with the real factoid
 * generator and print what came out, so a human can judge it before the
 * background worker is allowed to do this unattended.
 *
 *   npx tsx scripts/try-factoids.ts album 12
 *   npx tsx scripts/try-factoids.ts artist 5 --again   # clear its ledger row first
 *
 * THIS MAKES REAL, BILLED API CALLS (unless ANTHROPIC_BASE_URL points at a fake).
 * Read the "[factoids] ..." log line it prints. `search hosts` must be > 0; if it
 * is 0 while `submitted` is > 0, every citation was discarded as uncited and the
 * tool-runner loop is not yielding web_search_tool_result blocks.
 */
import { sql } from 'kysely'
import { db } from '../src/db/database.js'
import { claimEntity, recordResult } from '../src/services/factoidLedger.js'
import { generateFactoidsFor, FACTOID_MODEL } from '../src/services/factoidService.js'

const [kind, idArg, ...flags] = process.argv.slice(2)
const targetId = Number(idArg)
if ((kind !== 'album' && kind !== 'artist') || !Number.isInteger(targetId) || targetId <= 0) {
  console.error('usage: tsx scripts/try-factoids.ts <album|artist> <id> [--again]')
  process.exit(2)
}
const again = flags.includes('--again')

async function main() {
  const { rows: [conn] } = await sql<{ db: string }>`select current_database() as db`.execute(db)
  const entity = kind === 'album'
    ? await db.selectFrom('albums').select(['id', 'title as name']).where('id', '=', targetId).executeTakeFirst()
    : await db.selectFrom('artists').select(['id', 'name']).where('id', '=', targetId).executeTakeFirst()
  if (!entity) {
    console.error(`No ${kind} with id ${targetId} in database "${conn.db}".`)
    process.exit(1)
  }

  console.log(`Database: ${conn.db}`)
  console.log(`Model:    ${FACTOID_MODEL}`)
  console.log(`Target:   ${kind} ${targetId} "${entity.name}"`)
  console.log(`API:      ${process.env.ANTHROPIC_BASE_URL ?? 'api.anthropic.com (REAL, BILLED)'}\n`)

  if (again) {
    await db.deleteFrom('factoid_generations').where('kind', '=', kind).where('target_id', '=', targetId).execute()
  }
  const generationId = await claimEntity(kind, targetId)
  if (generationId === null) {
    const row = await db.selectFrom('factoid_generations').select(['status', 'attempts', 'error'])
      .where('kind', '=', kind).where('target_id', '=', targetId).executeTakeFirst()
    console.error(`Already researched or claimed (status=${row?.status}, attempts=${row?.attempts}). Re-run with --again to clear it first.`)
    process.exit(1)
  }

  try {
    const { status, count } = await generateFactoidsFor(kind, targetId, generationId)
    await recordResult(generationId, status, count)
    console.log(`\nResult: status=${status} count=${count}\n`)
  } catch (err) {
    await recordResult(generationId, 'failed', 0, (err as Error).message)
    console.error('\nGeneration FAILED:', (err as Error).message)
    process.exitCode = 1
    return
  }

  const stored = await db
    .selectFrom('factoids')
    .select(['kind', 'target_id', 'text', 'source_url'])
    .where('generation_id', '=', generationId)
    .execute()
  const trackTitles = new Map(
    (await db.selectFrom('tracks').select(['id', 'title']).where('id', 'in', stored.filter((f) => f.kind === 'track').map((f) => f.target_id).concat(0)).execute())
      .map((t) => [t.id, t.title]),
  )
  for (const f of stored) {
    const label = f.kind === 'track' ? `track "${trackTitles.get(f.target_id) ?? f.target_id}"` : f.kind
    console.log(`- [${label}] ${f.text}\n    ${f.source_url}`)
  }
  if (stored.length === 0) console.log('(nothing was stored)')
}

main()
  .catch((err) => { console.error(err); process.exitCode = 1 })
  .finally(() => db.destroy())

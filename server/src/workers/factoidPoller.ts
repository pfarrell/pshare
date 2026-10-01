// server/src/workers/factoidPoller.ts
// Decides what to research next and how often. Knows nothing about how
// research works: factoidService owns that. Every dependency is injected so a
// tick can be tested without a billed API call.
import {
  claimEntity, recordResult, reapStalePending, generationsInLastDay, nextCandidate,
  MAX_GENERATIONS_PER_DAY, type FactoidTargetKind,
} from '../services/factoidLedger.js'
import { generateFactoidsFor } from '../services/factoidService.js'

// One generation per minute, hard-capped per day by MAX_GENERATIONS_PER_DAY.
export const FACTOID_POLL_INTERVAL_MS = 60_000

export interface FactoidTickDeps {
  reapStalePending: () => Promise<number>
  generationsInLastDay: () => Promise<number>
  nextCandidate: () => Promise<{ kind: FactoidTargetKind, targetId: number } | null>
  claimEntity: (kind: FactoidTargetKind, targetId: number) => Promise<number | null>
  recordResult: (id: number, status: 'ok' | 'empty' | 'failed', count: number, error?: string | null) => Promise<void>
  generate: (kind: FactoidTargetKind, targetId: number, generationId: number) => Promise<{ status: 'ok' | 'empty', count: number }>
}

export type FactoidTickResult =
  | 'reaped-only' | 'capped' | 'no-candidate' | 'claim-lost' | 'generated' | 'errored'

export async function factoidTick(deps: FactoidTickDeps): Promise<FactoidTickResult> {
  // The reaper runs first and unconditionally: a wedged pending row must be
  // freed even while the daily cap is blocking new work.
  await deps.reapStalePending()

  if (await deps.generationsInLastDay() >= MAX_GENERATIONS_PER_DAY) return 'capped'

  const candidate = await deps.nextCandidate()
  if (!candidate) return 'no-candidate'

  const generationId = await deps.claimEntity(candidate.kind, candidate.targetId)
  if (generationId === null) return 'claim-lost'

  try {
    const { status, count } = await deps.generate(candidate.kind, candidate.targetId, generationId)
    await deps.recordResult(generationId, status, count)
    return 'generated'
  } catch (err) {
    // Never let one bad entity kill the poll loop. The ledger's retry policy
    // decides whether this entity is ever tried again.
    await deps.recordResult(generationId, 'failed', 0, (err as Error).message)
    console.error(`[factoids] generation failed for ${candidate.kind} ${candidate.targetId}:`, err)
    return 'errored'
  }
}

// `npm run worker` is also what runs locally for upload testing. With a real
// API key in the environment an unguarded poller would start spending money
// from the dev logs, so FACTOIDS_DISABLED=1 (or "true") turns it off.
export function factoidPollerEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  return env.FACTOIDS_DISABLED !== '1' && env.FACTOIDS_DISABLED !== 'true'
}

export function startFactoidPoller(): void {
  if (!factoidPollerEnabled()) {
    console.log('🎵 Factoid poller disabled (FACTOIDS_DISABLED is set)')
    return
  }
  const liveDeps: FactoidTickDeps = {
    reapStalePending, generationsInLastDay, nextCandidate, claimEntity, recordResult,
    generate: generateFactoidsFor,
  }
  const loop = async () => {
    try {
      await factoidTick(liveDeps)
    } catch (err) {
      console.error('[factoids] poller tick error:', err)
    }
    setTimeout(loop, FACTOID_POLL_INTERVAL_MS)
  }
  console.log(`🎵 Factoid poller started (every ${FACTOID_POLL_INTERVAL_MS}ms, max ${MAX_GENERATIONS_PER_DAY}/day)`)
  setTimeout(loop, FACTOID_POLL_INTERVAL_MS)
}

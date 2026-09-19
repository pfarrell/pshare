#!/usr/bin/env tsx
// server/scripts/consolidate-duplicate-media-files.ts
// Finds media_files rows that are duplicates of each other by either of two
// signals — identical file_hash (byte-identical files) or identical
// musicbrainz_recording_id (same recording, different rip/encode/bitrate)
// — found by joining through tracks.media_file_id, not by filtering on
// entity_type (see backfill-file-hash.ts's header comment). For each
// duplicate group it picks a canonical row, repoints every other track in
// the group to it, and deletes the now-unreferenced redundant media_files
// rows. Tracks are never merged: each keeps its own
// title/artist/approval-state/notes, only media_file_id changes.
//
// A musicbrainz_recording_id group is skipped entirely (never merged) if
// its member tracks' titles don't roughly agree — AcoustID-resolved
// recording ids are occasionally false positives, and merging two
// genuinely different recordings would be a real, hard-to-undo mistake.
// Skipped groups are logged with a SUSPICIOUS prefix for manual review.
//
// Canonical selection, per group: the file must still exist on disk, then
// the largest file on disk wins (the available proxy for audio quality —
// there's no stored bitrate), then oldest created_at, then lowest id. For a
// pure file_hash group this is a no-op versus always-identical byte size;
// it only matters for a recording_id group where the two files are
// genuinely different encodes.
//
// Physical files are NEVER deleted by this script. It prints a report of
// every file that's now safe to delete manually — lines prefixed
// "DELETABLE\t<path>\t<bytes>" so they're easy to grep out
// (e.g. `grep '^DELETABLE' out.txt | cut -f2 > to-delete.txt`). A path is
// excluded from that report (and reported instead as "RETAINED-PATH") if
// some OTHER, surviving media_files row still points at the exact same
// absolute_path — see the retained-path check at the end of main().
//
// Usage: tsx scripts/consolidate-duplicate-media-files.ts [--apply] [--limit N] [--log path] [--checkpoint N]
//   Default is dry-run (reports what would happen, writes nothing).
//   --apply is required for any database write — omitting --dry-run alone
//   is not enough, given the scale of what this touches.
//
// Progress checkpoints (every --checkpoint groups per pass, default 100)
// are written to both stdout and the log file, so `tail -f` on the log
// gives live status during a long unattended run.

import 'dotenv/config'
import fs from 'fs'
import { sql } from 'kysely'
import { db } from '../src/db/database.js'
import { titlesRoughlyMatch } from '../src/utils/titleMatch.js'

const args = process.argv.slice(2)
const getArg = (flag: string) => {
  const i = args.indexOf(flag)
  return i !== -1 ? args[i + 1] : undefined
}
const hasFlag = (flag: string) => args.includes(flag)

const limit = getArg('--limit') ? parseInt(getArg('--limit')!) : undefined
const apply = hasFlag('--apply')
const checkpointEvery = getArg('--checkpoint') ? parseInt(getArg('--checkpoint')!) : 100
const logPath = getArg('--log') || 'consolidate-duplicate-media-files.log'

function logLine(msg: string) {
  console.log(msg)
  fs.appendFileSync(logPath, msg + '\n')
}

console.log(apply
  ? '⚠️  APPLY mode: database will be modified'
  : '🔍 Dry-run mode: no writes will occur (pass --apply to modify the database)')
console.log(`📝 Progress log: ${logPath}`)

interface DeletableFile {
  mediaFileId: number
  absolutePath: string
  sizeBytes: number
}

const deletable: DeletableFile[] = []
const consolidatedAwayIds = new Set<number>()
let groupsConsolidated = 0, groupsSkipped = 0, groupsSuspicious = 0, groupsFailed = 0, tracksRepointed = 0, rowsDeleted = 0

// Looks up the current candidate rows for a group of media_files ids
// (scoped to track-linked rows, same as before), picks a canonical row,
// and — if --apply — repoints every other track in the group and deletes
// the redundant rows in one transaction. Always pushes redundant, still-
// on-disk files onto `deletable` for the end-of-run report, apply or not.
async function processGroup(mediaFileIds: number[], groupLabel: string): Promise<void> {
  const candidates = await db
    .selectFrom('media_files')
    .innerJoin('tracks', 'tracks.media_file_id', 'media_files.id')
    .select(['media_files.id', 'media_files.absolute_path', 'media_files.created_at'])
    .where('media_files.id', 'in', mediaFileIds)
    .where(eb => eb.or([eb('media_files.entity_type', 'is', null), eb('media_files.entity_type', '=', 'track')]))
    .distinct()
    .execute()

  const existing = candidates
    .filter(c => c.absolute_path && fs.existsSync(c.absolute_path))
    .map(c => ({ ...c, sizeBytes: fs.statSync(c.absolute_path!).size }))

  if (existing.length < 2) {
    if (existing.length === 0 && candidates.length > 0) {
      console.log(`  ⚠️  [${groupLabel}] no candidate row's file exists on disk — skipping group (${candidates.length} row(s))`)
      groupsSkipped++
    }
    // existing.length === 1 (or 0 with no candidates) means there's nothing
    // left to consolidate in this group — most commonly because an earlier
    // pass in this same run already merged it down to one surviving row.
    return
  }

  existing.sort((a, b) => {
    if (b.sizeBytes !== a.sizeBytes) return b.sizeBytes - a.sizeBytes
    const aTime = a.created_at ? new Date(a.created_at).getTime() : 0
    const bTime = b.created_at ? new Date(b.created_at).getTime() : 0
    if (aTime !== bTime) return aTime - bTime
    return a.id - b.id
  })
  const canonical = existing[0]
  const redundant = candidates.filter(c => c.id !== canonical.id)

  const redundantTrackCounts = await Promise.all(
    redundant.map(row =>
      db.selectFrom('tracks')
        .select(db.fn.count<number>('id').as('count'))
        .where('media_file_id', '=', row.id)
        .executeTakeFirst()
    )
  )
  const totalTracksToRepoint = redundantTrackCounts.reduce((sum, r) => sum + Number(r?.count ?? 0), 0)

  console.log(`  ✅ [${groupLabel}] canonical: media_files ${canonical.id} (${canonical.absolute_path}, ${canonical.sizeBytes} bytes); repointing ${totalTracksToRepoint} track(s) off ${redundant.length} redundant row(s)${apply ? '' : ' (dry-run, not applied)'}`)

  if (apply) {
    await db.transaction().execute(async (trx) => {
      for (const row of redundant) {
        await trx
          .updateTable('tracks')
          .set({ media_file_id: canonical.id, updated_at: new Date() })
          .where('media_file_id', '=', row.id)
          .execute()
        await trx.deleteFrom('media_files').where('id', '=', row.id).execute()
      }
    })
  }

  for (const row of redundant) {
    consolidatedAwayIds.add(row.id)
    let sizeBytes = 0
    if (row.absolute_path && fs.existsSync(row.absolute_path)) {
      sizeBytes = fs.statSync(row.absolute_path).size
    }
    deletable.push({ mediaFileId: row.id, absolutePath: row.absolute_path ?? '(no path recorded)', sizeBytes })
  }

  groupsConsolidated++
  tracksRepointed += totalTracksToRepoint
  rowsDeleted += redundant.length
}

async function runHashPass(): Promise<void> {
  const groupCounts = await db
    .selectFrom('media_files')
    .innerJoin('tracks', 'tracks.media_file_id', 'media_files.id')
    .select(['media_files.file_hash', sql<number>`count(distinct media_files.id)`.as('mediaFileCount')])
    .where('media_files.file_hash', 'is not', null)
    .groupBy('media_files.file_hash')
    .execute()

  const duplicateGroups = groupCounts.filter(g => Number(g.mediaFileCount) > 1)
  const hashes = duplicateGroups.map(g => g.file_hash!).slice(0, limit)

  logLine(`\n🔁 [hash pass] Found ${duplicateGroups.length} duplicate-hash group(s)${limit ? `, processing first ${hashes.length}` : ''}`)

  let processed = 0
  for (const hash of hashes) {
    processed++
    try {
      const idRows = await db
        .selectFrom('media_files')
        .innerJoin('tracks', 'tracks.media_file_id', 'media_files.id')
        .select(['media_files.id'])
        .where('media_files.file_hash', '=', hash)
        .distinct()
        .execute()
      await processGroup(idRows.map(r => r.id), `hash ${hash}`)
    } catch (err) {
      groupsFailed++
      console.error(`  ❌ [hash ${hash}] failed: ${(err as Error).message}`)
    } finally {
      if (processed % checkpointEvery === 0) {
        logLine(`  [hash pass ${processed}/${hashes.length}] checkpoint — ✅${groupsConsolidated} ⚠️${groupsSkipped} 🕵️${groupsSuspicious} ❌${groupsFailed} | tracks repointed=${tracksRepointed} rows deleted=${rowsDeleted}`)
      }
    }
  }
}

async function runRecordingPass(): Promise<void> {
  const groupCounts = await db
    .selectFrom('media_files')
    .innerJoin('tracks', 'tracks.media_file_id', 'media_files.id')
    .select(['media_files.musicbrainz_recording_id', sql<number>`count(distinct media_files.id)`.as('mediaFileCount')])
    .where('media_files.musicbrainz_recording_id', 'is not', null)
    .where(eb => eb.or([eb('media_files.entity_type', 'is', null), eb('media_files.entity_type', '=', 'track')]))
    .groupBy('media_files.musicbrainz_recording_id')
    .execute()

  const duplicateGroups = groupCounts.filter(g => Number(g.mediaFileCount) > 1)
  const recordingIds = duplicateGroups.map(g => g.musicbrainz_recording_id!).slice(0, limit)

  logLine(`\n🔁 [recording pass] Found ${duplicateGroups.length} duplicate-recording group(s)${limit ? `, processing first ${recordingIds.length}` : ''}`)

  let processed = 0
  for (const recordingId of recordingIds) {
    processed++
    try {
      const memberRows = await db
        .selectFrom('media_files')
        .innerJoin('tracks', 'tracks.media_file_id', 'media_files.id')
        .select(['media_files.id', 'tracks.title'])
        .where('media_files.musicbrainz_recording_id', '=', recordingId)
        .where(eb => eb.or([eb('media_files.entity_type', 'is', null), eb('media_files.entity_type', '=', 'track')]))
        .execute()

      const liveMembers = memberRows.filter(r => !consolidatedAwayIds.has(r.id))
      const memberIds = [...new Set(liveMembers.map(r => r.id))]
      if (memberIds.length < 2) continue // already merged down by an earlier pass this run

      const titles = liveMembers.map(r => r.title).filter((t): t is string => !!t)
      const referenceTitle = titles[0]
      const suspicious = referenceTitle !== undefined && titles.some(t => !titlesRoughlyMatch(referenceTitle, t))
      if (suspicious) {
        logLine(`SUSPICIOUS\trecording ${recordingId}\ttitles: ${[...new Set(titles)].join(' | ')}`)
        groupsSuspicious++
        continue
      }

      await processGroup(memberIds, `recording ${recordingId}`)
    } catch (err) {
      groupsFailed++
      console.error(`  ❌ [recording ${recordingId}] failed: ${(err as Error).message}`)
    } finally {
      if (processed % checkpointEvery === 0) {
        logLine(`  [recording pass ${processed}/${recordingIds.length}] checkpoint — ✅${groupsConsolidated} ⚠️${groupsSkipped} 🕵️${groupsSuspicious} ❌${groupsFailed} | tracks repointed=${tracksRepointed} rows deleted=${rowsDeleted}`)
      }
    }
  }
}

async function main() {
  await runHashPass()
  await runRecordingPass()

  logLine(`\n  Groups: ✅ ${groupsConsolidated} consolidated | ⚠️  ${groupsSkipped} skipped (no existing file) | 🕵️ ${groupsSuspicious} suspicious (title mismatch, not merged) | ❌ ${groupsFailed} failed | 🎵 ${tracksRepointed} track(s) repointed | 🗑️  ${rowsDeleted} redundant row(s) ${apply ? 'deleted' : 'would be deleted'}`)

  if (deletable.length > 0) {
    const redundantIds = new Set(deletable.map(f => f.mediaFileId))
    const uniquePaths = [...new Set(deletable.map(f => f.absolutePath).filter(p => p !== '(no path recorded)'))]
    const stillReferenced = uniquePaths.length > 0
      ? await db.selectFrom('media_files').select(['id', 'absolute_path']).where('absolute_path', 'in', uniquePaths).execute()
      : []
    const retainedPaths = new Set(
      stillReferenced.filter(r => !redundantIds.has(r.id)).map(r => r.absolute_path!)
    )

    const retained = deletable.filter(f => retainedPaths.has(f.absolutePath))
    const safelyDeletable = deletable.filter(f => !retainedPaths.has(f.absolutePath))

    if (retained.length > 0) {
      logLine(`\n⚠️  ${retained.length} file(s) excluded from DELETABLE — path still used by a surviving media_files row:`)
      for (const f of retained) {
        logLine(`RETAINED-PATH\t${f.absolutePath}`)
      }
    }

    if (safelyDeletable.length > 0) {
      const totalBytes = safelyDeletable.reduce((sum, f) => sum + f.sizeBytes, 0)
      logLine(`\n📋 DELETABLE FILES (${apply ? 'now safe to delete' : 'would become safe to delete once --apply is run'}) — review before removing anything:`)
      for (const f of safelyDeletable) {
        logLine(`DELETABLE\t${f.absolutePath}\t${f.sizeBytes}`)
      }
      logLine(`\n  Total: ${safelyDeletable.length} file(s), ${(totalBytes / 1024 / 1024).toFixed(1)} MB`)
    }
  }

  logLine('\n✨ Done')
  process.exit(0)
}

main().catch(err => {
  console.error('Fatal error:', err)
  process.exit(1)
})

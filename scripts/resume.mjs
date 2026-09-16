#!/usr/bin/env node
/**
 * resume.mjs
 * ───────────
 * Finds interrupted or running runs and returns state for resumption.
 *
 * Usage:
 *   node scripts/resume.mjs                    → most recent interrupted run
 *   node scripts/resume.mjs --run-id run-abc   → specific run
 *   node scripts/resume.mjs --list             → all runs with status
 *
 * Output: JSON metadata of the run, or null if nothing to resume.
 */

import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'

const RUNS_ROOT = join(process.cwd(), '.adaptive-orchestrator', 'runs')
const RESUMABLE = new Set(['interrupted', 'running', 'pending'])

function metaPath(runId) {
  return join(RUNS_ROOT, runId, 'metadata.json')
}

function allRuns() {
  if (!existsSync(RUNS_ROOT)) return []
  return readdirSync(RUNS_ROOT, { withFileTypes: true })
    .filter(d => d.isDirectory())
    .map(d => {
      try { return JSON.parse(readFileSync(metaPath(d.name), 'utf8')) }
      catch { return null }
    })
    .filter(Boolean)
    .sort((a, b) => b.startedAt.localeCompare(a.startedAt))
}

// ─── Arg parser ───────────────────────────────────────────────────────────────

const args = {}
const argv = process.argv.slice(2)
for (let i = 0; i < argv.length; i++) {
  if (argv[i].startsWith('--')) {
    args[argv[i]] = argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[++i] : true
  }
}

// ─── Main ─────────────────────────────────────────────────────────────────────

function out(data) { process.stdout.write(JSON.stringify(data, null, 2) + '\n') }

if (args['--list']) {
  out(allRuns())
  process.exit(0)
}

if (args['--run-id']) {
  const path = metaPath(args['--run-id'])
  if (!existsSync(path)) {
    process.stderr.write(`Run not found: ${args['--run-id']}\n`)
    process.exit(1)
  }
  out(JSON.parse(readFileSync(path, 'utf8')))
  process.exit(0)
}

// Find most recent resumable run
const resumable = allRuns().find(r => RESUMABLE.has(r.status))
out(resumable ?? null)

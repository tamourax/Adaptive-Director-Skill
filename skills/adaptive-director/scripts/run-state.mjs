#!/usr/bin/env node
/**
 * run-state.mjs
 * ──────────────
 * Manages run workspace files.
 * All operations are deterministic — no reasoning.
 *
 * Commands:
 *   node scripts/run-state.mjs init     --run-id <id> --task <str> --size <s> --budget <b>
 *   node scripts/run-state.mjs update   --run-id <id> --status <s> [--phase <p>]
 *   node scripts/run-state.mjs read     --run-id <id>
 *   node scripts/run-state.mjs write-phase --run-id <id> --phase <p> --status <s> --summary <str> [--findings-json <json>]
 *   node scripts/run-state.mjs read-phase  --run-id <id> --phase <p>
 *   node scripts/run-state.mjs build-brief --run-id <id> --phase <p>
 *   node scripts/run-state.mjs list
 */

import {
  mkdirSync, writeFileSync, readFileSync,
  existsSync, readdirSync
} from 'node:fs'
import { join } from 'node:path'
import { randomBytes } from 'node:crypto'

// ─── Workspace root ───────────────────────────────────────────────────────────

const RUNS_ROOT = existsSync(join(process.cwd(), '.adaptive-orchestrator', 'runs'))
  ? join(process.cwd(), '.adaptive-orchestrator', 'runs')
  : join(process.cwd(), '.adaptive-director', 'runs')

function runDir(runId) { return join(RUNS_ROOT, runId) }
function metaPath(runId) { return join(runDir(runId), 'metadata.json') }
function phaseMdPath(runId, phase) { return join(runDir(runId), `${phase}.md`) }
function phaseJsonPath(runId, phase) { return join(runDir(runId), `${phase}.json`) }

// ─── Commands ─────────────────────────────────────────────────────────────────

function cmdInit(args) {
  const runId  = args['--run-id']  ?? ('run-' + randomBytes(4).toString('hex'))
  const task   = args['--task']    ?? ''
  const size   = args['--size']    ?? 'medium'
  const budget = args['--budget']  ?? 'balanced'

  mkdirSync(runDir(runId), { recursive: true })

  // task.md
  writeFileSync(phaseMdPath(runId, 'task'),
    `# Task\n\n${task}\n\n## Constraints\n\n- Stay in scope\n- Document all decisions\n`, 'utf8')

  // metadata.json
  const meta = {
    runId,
    task,
    status: 'pending',
    currentPhase: null,
    size,
    budget,
    allowMax: false,
    useDelegate: false,
    routing: [],
    startedAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  }
  writeFileSync(metaPath(runId), JSON.stringify(meta, null, 2), 'utf8')

  out({ runId, workspacePath: runDir(runId) })
}

function cmdUpdate(args) {
  const runId  = requireArg(args, '--run-id')
  const status = args['--status']
  const phase  = args['--phase'] ?? null

  const meta = readMeta(runId)
  if (status) meta.status = status
  if (phase !== null) meta.currentPhase = phase
  meta.updatedAt = new Date().toISOString()
  writeFileSync(metaPath(runId), JSON.stringify(meta, null, 2), 'utf8')
  out({ ok: true, runId, status: meta.status, currentPhase: meta.currentPhase })
}

function cmdRead(args) {
  const runId = requireArg(args, '--run-id')
  out(readMeta(runId))
}

function cmdWritePhase(args) {
  const runId   = requireArg(args, '--run-id')
  const phase   = requireArg(args, '--phase')
  const status  = args['--status'] ?? 'completed'
  const summary = args['--summary'] ?? ''
  const findingsRaw = args['--findings-json']

  let findings = []
  if (findingsRaw) {
    try { findings = JSON.parse(findingsRaw) } catch { findings = [] }
  }

  const criticalFindings   = findings.filter(f => (f.severity || '').toLowerCase() === 'critical')
  const warningFindings    = findings.filter(f => (f.severity || '').toLowerCase() === 'warning')
  const suggestionFindings = findings.filter(f => (f.severity || '').toLowerCase() === 'suggestion')

  const counts = {
    critical: criticalFindings.length,
    warning: warningFindings.length,
    suggestion: suggestionFindings.length,
    total: findings.length,
  }

  // Concept spec Section 7 & 8:
  // Fix cycle is ONLY triggered if critical_count > 0.
  // Warnings and suggestions are recorded in the report but do NOT trigger fix or block progression to verify.
  const needsFix = counts.critical > 0
  const nextPhase = (phase === 'review')
    ? (needsFix ? 'fix' : 'verify')
    : null

  const resolvedStatus = (phase === 'review' && status === 'completed')
    ? (needsFix ? 'needs_fix' : 'passed')
    : status

  const result = {
    phase,
    status: resolvedStatus,
    summary,
    findings,
    counts,
    criticalCount: counts.critical,
    warningCount: counts.warning,
    suggestionCount: counts.suggestion,
    needsFix,
    nextPhase,
  }

  // .json (machine contract)
  writeFileSync(phaseJsonPath(runId, phase), JSON.stringify(result, null, 2), 'utf8')

  // .md (human readable)
  const lines = [
    `# ${capitalize(phase)} Result`,
    '',
    `**Status:** ${resolvedStatus}`,
    '',
    '## Summary',
    '',
    summary,
  ]
  if (findings.length > 0) {
    lines.push(
      '',
      '## Findings Summary',
      '',
      `- **Critical:** ${counts.critical} ${counts.critical > 0 ? '(Fix cycle required)' : '(None - Proceed to verification)'}`,
      `- **Warning:** ${counts.warning} (Advisory - does not block)`,
      `- **Suggestion:** ${counts.suggestion} (Informational)`,
      '',
      '## Detailed Findings',
      ''
    )
    for (const f of findings) {
      lines.push(`### [${f.severity?.toUpperCase() ?? 'NOTE'}] ${f.title ?? ''}`)
      if (f.file) lines.push(`**File:** \`${f.file}\``)
      lines.push('', f.description ?? '', '')
    }
  }
  writeFileSync(phaseMdPath(runId, phase), lines.join('\n'), 'utf8')

  out({
    ok: true,
    phase,
    status: resolvedStatus,
    counts,
    criticalCount: counts.critical,
    warningCount: counts.warning,
    suggestionCount: counts.suggestion,
    needsFix,
    nextPhase,
  })
}

function cmdReadPhase(args) {
  const runId = requireArg(args, '--run-id')
  const phase = requireArg(args, '--phase')
  const path  = phaseJsonPath(runId, phase)
  if (!existsSync(path)) { out(null); return }
  out(JSON.parse(readFileSync(path, 'utf8')))
}

function cmdEvalReview(args) {
  const runId = requireArg(args, '--run-id')
  const path  = phaseJsonPath(runId, 'review')
  if (!existsSync(path)) {
    out({ ok: false, error: `Review phase not found for run ${runId}` })
    return
  }
  const rev = JSON.parse(readFileSync(path, 'utf8'))
  const findings = rev.findings ?? []
  const critical = findings.filter(f => (f.severity || '').toLowerCase() === 'critical').length
  const warning  = findings.filter(f => (f.severity || '').toLowerCase() === 'warning').length
  const suggestion = findings.filter(f => (f.severity || '').toLowerCase() === 'suggestion').length
  const needsFix = critical > 0

  out({
    ok: true,
    runId,
    criticalCount: critical,
    warningCount: warning,
    suggestionCount: suggestion,
    needsFix,
    nextPhase: needsFix ? 'fix' : 'verify',
    canProceedToVerify: !needsFix,
  })
}

function cmdBuildBrief(args) {
  const runId = requireArg(args, '--run-id')
  const phase = requireArg(args, '--phase')

  const dir   = runDir(runId)
  const task  = safeRead(join(dir, 'task.md'))
  const plan  = safeRead(join(dir, 'plan.md'))
  const impl  = safeRead(join(dir, 'implementation.md'))
  const rev   = safeRead(join(dir, 'review.md'))

  let brief = ''

  switch (phase) {
    case 'plan':
      brief = [
        task ?? '',
        '---',
        '# Your Role: Planner',
        '',
        'Inspect the repository and produce a detailed step-by-step plan.',
        'After inspecting, if the initial task size estimate seems wrong, say so.',
        '',
        '## Required Output',
        '1. Numbered implementation steps',
        '2. Files/modules involved',
        '3. Acceptance criteria',
        '4. Constraints',
        '5. End with a JSON block:',
        '```json',
        '{"recommended_size": "medium", "reason": "..."}',
        '```',
      ].join('\n')
      break

    case 'implement':
      brief = [
        task ?? '',
        '',
        '---',
        '',
        '# Approved Plan',
        '',
        plan ?? '(no plan — use best judgment)',
        '',
        '---',
        '',
        '# Your Role: Implementer',
        '',
        '- Implement the approved plan exactly.',
        '- Stay in scope. Do NOT commit.',
        '- Report: changed files, completed work, test results, known issues.',
      ].join('\n')
      break

    case 'review':
      brief = [
        task ?? '',
        '',
        '---',
        '',
        '# Plan',
        plan ?? '(no plan)',
        '',
        '---',
        '',
        '# Implementation Report',
        impl ?? '(no implementation report)',
        '',
        '---',
        '',
        '# Your Role: Independent Reviewer',
        '',
        'Review the implementation against the plan.',
        'Classify EVERY finding as exactly one of:',
        '  CRITICAL — must fix before completion',
        '  WARNING  — report, do not block',
        '  SUGGESTION — informational only',
        '',
        'Format each finding as:',
        '  [CRITICAL] <title>',
        '  File: <filename>',
        '  <description>',
      ].join('\n')
      break

    case 'fix':
      brief = [
        task ?? '',
        '',
        '---',
        '',
        '# Previous Review (with CRITICAL findings)',
        rev ?? '(no review)',
        '',
        '---',
        '',
        '# Your Role: Fixer',
        '',
        'Fix ONLY the CRITICAL findings listed above.',
        'Do not redesign or change scope.',
        'Do NOT commit.',
        'Report what you changed.',
      ].join('\n')
      break

    case 'verify':
      brief = [
        task ?? '',
        '',
        '---',
        '',
        '# Plan',
        plan ?? '(no plan)',
        '',
        '---',
        '',
        '# Your Role: Verifier',
        '',
        'Verify the implementation:',
        '- Requirements satisfied?',
        '- Tests passing?',
        '- Build successful?',
        '- All CRITICAL findings resolved?',
        '- Implementation matches plan?',
        '',
        'End with either:',
        '  VERIFIED — all checks passed',
        '  BLOCKED  — <reason>',
      ].join('\n')
      break

    default:
      brief = task ?? ''
  }

  // Persist brief file to run workspace for direct relay/agent consumption
  try {
    writeFileSync(join(dir, `brief-${phase}.md`), brief, 'utf8')
  } catch {}

  process.stdout.write(brief + '\n')
}

function cmdList() {
  if (!existsSync(RUNS_ROOT)) { out([]); return }
  const dirs = readdirSync(RUNS_ROOT, { withFileTypes: true })
    .filter(d => d.isDirectory()).map(d => d.name)
  const runs = dirs.map(id => {
    try { return JSON.parse(readFileSync(metaPath(id), 'utf8')) } catch { return null }
  }).filter(Boolean)
  runs.sort((a, b) => b.startedAt.localeCompare(a.startedAt))
  out(runs)
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function readMeta(runId) {
  const path = metaPath(runId)
  if (!existsSync(path)) throw new Error(`Run not found: ${runId}`)
  return JSON.parse(readFileSync(path, 'utf8'))
}

function safeRead(path) {
  return existsSync(path) ? readFileSync(path, 'utf8') : null
}

function requireArg(args, key) {
  if (!args[key]) { process.stderr.write(`Missing required argument: ${key}\n`); process.exit(2) }
  return args[key]
}

function out(data) {
  process.stdout.write(JSON.stringify(data, null, 2) + '\n')
}

function capitalize(s) {
  return s.charAt(0).toUpperCase() + s.slice(1)
}

// ─── Arg parser ───────────────────────────────────────────────────────────────

function parseArgs(argv) {
  const args = {}
  for (let i = 0; i < argv.length; i++) {
    if (argv[i].startsWith('--')) {
      args[argv[i]] = argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[++i] : true
    }
  }
  return args
}

// ─── Entry ────────────────────────────────────────────────────────────────────

const [,, command, ...rest] = process.argv
const args = parseArgs(rest)

try {
  switch (command) {
    case 'init':        cmdInit(args);        break
    case 'update':      cmdUpdate(args);      break
    case 'read':        cmdRead(args);        break
    case 'write-phase': cmdWritePhase(args);  break
    case 'read-phase':  cmdReadPhase(args);   break
    case 'eval-review': cmdEvalReview(args);  break
    case 'build-brief': cmdBuildBrief(args);  break
    case 'list':        cmdList();            break
    default:
      process.stderr.write(`Unknown command: ${command}\n`)
      process.stderr.write('Commands: init, update, read, write-phase, read-phase, eval-review, build-brief, list\n')
      process.exit(2)
  }
} catch (err) {
  process.stderr.write('run-state.mjs error: ' + err.message + '\n')
  process.exit(1)
}

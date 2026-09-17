#!/usr/bin/env node
import { execFileSync } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import route, { getModelFamily } from '../skills/adaptive-director/scripts/route.mjs'
import { executeDelegateRelay } from '../skills/adaptive-director/scripts/delegate-relay.mjs'
import { runVerificationEvidence } from './verify-evidence.mjs'

const __dirname = dirname(fileURLToPath(import.meta.url))
const projectRoot = join(__dirname, '..')
const runStateScript = join(projectRoot, 'skills', 'adaptive-director', 'scripts', 'run-state.mjs')
const registryPath = join(projectRoot, 'skills', 'adaptive-director', 'data', 'registry.json')

const TERMINAL_STATUSES = new Set(['completed', 'blocked', 'needs_recovery', 'failed'])

function parseArgs(argv) {
  const opts = {
    budget: 'balanced',
    delegateEnabled: false,
    allowMax: false,
    dryRun: false,
    cwd: process.cwd(),
  }
  const taskParts = []
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]
    if (arg === '--budget' && argv[i + 1]) opts.budget = argv[++i]
    else if (arg === '--delegate') opts.delegateEnabled = true
    else if (arg === '--allow-max') opts.allowMax = true
    else if (arg === '--dry-run') opts.dryRun = true
    else if (arg === '--cwd' && argv[i + 1]) opts.cwd = argv[++i]
    else taskParts.push(arg)
  }
  opts.task = taskParts.join(' ').trim()
  return opts
}

function runState(command, args = [], { json = true } = {}) {
  const out = execFileSync(process.execPath, [runStateScript, command, ...args], {
    cwd: projectRoot,
    encoding: 'utf8',
    timeout: 30000,
  })
  return json ? JSON.parse(out.trim()) : out
}

function classifyTask(task) {
  const text = task.toLowerCase()
  if (/\b(rename|typo|copy|label|color|minor|small|text)\b/.test(text)) return 'small'
  if (/\b(architecture|redesign|migration|auth system|payment architecture|large|major|refactor architecture)\b/.test(text)) return 'large'
  return 'medium'
}

function phaseMap(size) {
  const registry = JSON.parse(readFileSync(registryPath, 'utf8'))
  return registry.phase_map?.[size] ?? ['plan', 'implement', 'review', 'verify']
}

function parseFindings(text) {
  const findings = []
  const lines = String(text ?? '').split(/\r?\n/)
  for (let i = 0; i < lines.length; i++) {
    const match = lines[i].match(/^\s*\[(CRITICAL|WARNING|SUGGESTION)\]\s*(.+)$/i)
    if (!match) continue
    const severity = match[1].toLowerCase()
    const title = match[2].trim()
    let file = null
    const desc = []
    for (let j = i + 1; j < lines.length; j++) {
      if (/^\s*\[(CRITICAL|WARNING|SUGGESTION)\]/i.test(lines[j])) break
      const fileMatch = lines[j].match(/^\s*File:\s*(.+)$/i)
      if (fileMatch) file = fileMatch[1].trim()
      else if (lines[j].trim()) desc.push(lines[j].trim())
    }
    findings.push({ severity, title, ...(file ? { file } : {}), description: desc.join('\n') })
  }
  return findings
}

function normalizeRouteRecord(phase, decision, opts, reason) {
  const model = decision.model ?? null
  const registry = existsSync(registryPath) ? JSON.parse(readFileSync(registryPath, 'utf8')) : {}
  return {
    phase,
    agent: decision.agent,
    model,
    ...(model ? { modelFamily: getModelFamily(model, registry) } : {}),
    effort: decision.effort,
    execution: decision.execution,
    budget: opts.budget,
    reason,
    ...(decision.antiAffinity ? {
      antiAffinity: {
        tier: decision.antiAffinity.tier,
        label: decision.antiAffinity.description,
      }
    } : {}),
    ...(decision.relayPath ? { relayPath: decision.relayPath } : {}),
  }
}

function mockPhaseResult({ phase, task, scenario, reviewAttempt }) {
  if (!scenario) return null

  if (phase === 'plan') {
    return {
      ok: true,
      status: 'completed',
      summary: [
        `Mock plan for: ${task}`,
        '1. Inspect relevant files',
        '2. Implement scoped change',
        '3. Verify behavior',
        '```json',
        '{"recommended_size": "medium", "reason": "mock scenario"}',
        '```',
      ].join('\n'),
    }
  }

  if (phase === 'implement') {
    return {
      ok: true,
      status: 'completed',
      summary: `Mock implementation report for: ${task}\nChanged files: src/mock.js\nTests: pending verification`,
    }
  }

  if (phase === 'review') {
    if (scenario === 'critical-fix' && reviewAttempt === 1) {
      return {
        ok: true,
        status: 'completed',
        summary: '[CRITICAL] Missing retry guard\nFile: src/mock.js\nThe implementation does not guard duplicate retries.',
      }
    }
    if (scenario === 'blocked') {
      return {
        ok: true,
        status: 'completed',
        summary: '[CRITICAL] Critical issue remains\nFile: src/mock.js\nThe critical issue remains after the fix.',
      }
    }
    return {
      ok: true,
      status: 'completed',
      summary: '[WARNING] Minor follow-up\nFile: src/mock.js\nConsider adding a narrower unit test.',
    }
  }

  if (phase === 'fix') {
    return {
      ok: true,
      status: 'completed',
      summary: 'Mock fix report: fixed only the critical retry guard.',
    }
  }

  if (phase === 'verify') {
    return {
      ok: true,
      status: 'completed',
      summary: 'VERIFIED - mock verification evidence passed.',
    }
  }

  return { ok: true, status: 'completed', summary: `Mock ${phase} completed.` }
}

function executeNativePhase({ phase, brief, decision, opts, runId, reviewAttempt }) {
  const scenario = process.env.AD_RUN_MOCK_SCENARIO
  const mock = mockPhaseResult({ phase, task: opts.task, scenario, reviewAttempt })
  if (mock) return mock

  const executor = process.env.AD_NATIVE_EXECUTOR
  if (!executor) {
    return {
      ok: false,
      status: 'failed',
      error: 'native_invocation_required',
      summary: `Native execution for agent '${decision.agent}' cannot be invoked automatically in this environment. Set AD_NATIVE_EXECUTOR or use --delegate with a configured relay.`,
    }
  }

  const payload = JSON.stringify({ phase, runId, route: decision, brief })
  try {
    const out = execFileSync(executor, [], {
      cwd: opts.cwd,
      input: payload,
      encoding: 'utf8',
      timeout: 600000,
      shell: true,
    })
    const parsed = JSON.parse(out.trim())
    return {
      ok: parsed.ok !== false,
      status: parsed.status ?? 'completed',
      summary: parsed.summary ?? parsed.finalMessage ?? out,
      findings: parsed.findings,
    }
  } catch (err) {
    return {
      ok: false,
      status: 'failed',
      error: 'native_executor_failed',
      summary: err.message,
    }
  }
}

function executePhase({ phase, decision, opts, runId, reviewAttempt }) {
  const brief = runState('build-brief', ['--run-id', runId, '--phase', phase], { json: false })

  if (decision.execution === 'delegate') {
    const relayResult = executeDelegateRelay({
      agent: decision.agent,
      briefContent: brief,
      cwd: opts.cwd,
      model: decision.model,
      effort: decision.effort,
      customRelayPath: decision.relayPath,
    })

    if (relayResult.ok) {
      return {
        ok: true,
        status: 'completed',
        summary: relayResult.finalMessage || `Delegate ${decision.agent} completed ${phase}.`,
      }
    }

    if (relayResult.recoveryRequired) {
      return {
        ok: false,
        status: 'needs_recovery',
        error: relayResult.error,
        summary: relayResult.message,
      }
    }

    if (relayResult.safeFallbackToNative) {
      return executeNativePhase({ phase, brief, decision: { ...decision, execution: 'native' }, opts, runId, reviewAttempt })
    }

    return {
      ok: false,
      status: 'failed',
      error: relayResult.error,
      summary: relayResult.message,
    }
  }

  return executeNativePhase({ phase, brief, decision, opts, runId, reviewAttempt })
}

function writePhase(runId, phase, result, findings = null) {
  const args = [
    '--run-id', runId,
    '--phase', phase,
    '--status', result.status ?? 'completed',
    '--summary', result.summary ?? '',
  ]
  if (findings) args.push('--findings-json', JSON.stringify(findings))
  return runState('write-phase', args)
}

function setFinalStatus(runId, status) {
  if (!TERMINAL_STATUSES.has(status)) throw new Error(`Invalid terminal status: ${status}`)
  return runState('set-final-status', ['--run-id', runId, '--status', status])
}

function printPhaseHeader(index, total, phase, decision) {
  console.log(`\n[${index}/${total}] ${capitalize(phase)}`)
  console.log(`  Agent: ${decision.agent}`)
  if (decision.model) console.log(`  Model: ${decision.model}`)
  console.log(`  Effort: ${decision.effort}`)
  if (decision.antiAffinity) console.log(`  Anti-affinity: Tier ${decision.antiAffinity.tier}`)
}

function capitalize(s) {
  return s.charAt(0).toUpperCase() + s.slice(1)
}

export async function runAdaptiveDirector(opts) {
  if (!opts.task) throw new Error('Usage: adaptive-director run "<task>"')

  const size = classifyTask(opts.task)
  const initialPhases = phaseMap(size)
  const init = runState('init', ['--task', opts.task, '--size', size, '--budget', opts.budget])
  const runId = init.runId

  console.log('Adaptive Director')
  console.log(`Run: ${runId}`)
  console.log(`\nTask size: ${size}`)
  console.log(`Budget: ${opts.budget}`)

  if (opts.dryRun) {
    for (const phase of initialPhases) {
      const decision = route({ taskSize: size, phase, budget: opts.budget, allowMax: opts.allowMax, delegateEnabled: opts.delegateEnabled })
      console.log(`${phase}: ${decision.agent} ${decision.model ?? ''} ${decision.effort} ${decision.execution}`)
    }
    setFinalStatus(runId, 'completed')
    return { runId, status: 'completed' }
  }

  const executed = []
  let implDecision = null
  let fixCycles = 0
  let reviewAttempt = 0
  let queue = [...initialPhases]

  while (queue.length > 0) {
    const phase = queue.shift()
    const phaseLabel = phase === 'review-rereview' ? 'review' : phase
    runState('update', ['--run-id', runId, '--status', 'running', '--phase', phase])

    const decision = route({
      taskSize: size,
      phase: phaseLabel,
      budget: opts.budget,
      allowMax: opts.allowMax,
      delegateEnabled: opts.delegateEnabled,
      currentAgent: phaseLabel === 'review' ? implDecision?.agent : null,
      currentModel: phaseLabel === 'review' ? implDecision?.model : 'unknown',
    })
    const routeRecord = normalizeRouteRecord(phase, decision, opts, decision.source ?? `selected for ${phaseLabel}`)
    runState('add-route', ['--run-id', runId, '--phase', phase, '--route-json', JSON.stringify(routeRecord)])

    printPhaseHeader(executed.length + 1, initialPhases.length + (fixCycles * 2), phase, decision)

    if (phaseLabel === 'review') reviewAttempt += 1

    let verificationEvidence = null
    if (phaseLabel === 'verify') {
      const mockEvidence = process.env.AD_RUN_MOCK_SCENARIO
        ? { passed: true, projectTypes: ['mock'], commands: [{ command: 'mock verify', exitCode: 0, durationMs: 1 }] }
        : null
      verificationEvidence = runVerificationEvidence({ cwd: opts.cwd, mockEvidence })
      runState('write-evidence', ['--run-id', runId, '--evidence-json', JSON.stringify(verificationEvidence)])
    }

    let result = executePhase({ phase: phaseLabel, decision, opts, runId, reviewAttempt })
    if (!result.ok) {
      const terminal = result.status === 'needs_recovery' ? 'needs_recovery' : 'failed'
      writePhase(runId, phase, result)
      setFinalStatus(runId, terminal)
      console.log(`  x ${result.summary}`)
      console.log(`\nStatus: ${terminal}`)
      return { runId, status: terminal }
    }

    if (phaseLabel === 'verify') {
      const evidence = verificationEvidence
      if (!evidence.skipped && !evidence.passed) {
        result = {
          ok: true,
          status: 'blocked',
          summary: `Verification evidence failed: ${evidence.commands.filter(c => c.exitCode !== 0).map(c => c.command).join(', ')}`,
        }
        writePhase(runId, phase, result)
        setFinalStatus(runId, 'blocked')
        console.log(`  x ${result.summary}`)
        console.log('\nStatus: blocked')
        return { runId, status: 'blocked' }
      }
      result.summary = [
        result.summary,
        evidence.skipped
          ? 'Deterministic verification skipped: no supported project verification commands detected.'
          : `Deterministic verification passed: ${evidence.commands.map(c => c.command).join(', ')}`,
      ].join('\n')
    }

    const findings = result.findings ?? (phaseLabel === 'review' ? parseFindings(result.summary) : null)
    writePhase(runId, phase, result, findings)
    executed.push(phase)

    if (phaseLabel === 'implement') implDecision = decision

    if (phaseLabel === 'review') {
      const criticalCount = findings?.filter(f => f.severity === 'critical').length ?? 0
      const warningCount = findings?.filter(f => f.severity === 'warning').length ?? 0
      console.log(`  ✓ ${criticalCount} critical`)
      if (warningCount > 0) console.log(`  ! ${warningCount} warnings`)

      const verifyIndex = queue.indexOf('verify')
      if (criticalCount > 0) {
        if (fixCycles >= 1) {
          setFinalStatus(runId, 'blocked')
          console.log('  x Critical findings remain after allowed fix cycle')
          console.log('\nStatus: blocked')
          return { runId, status: 'blocked' }
        }
        fixCycles += 1
        if (verifyIndex !== -1) queue.splice(verifyIndex, 0, 'fix', 'review-rereview')
        else queue.push('fix', 'review-rereview')
      }
    } else {
      console.log('  ✓ Completed')
    }
  }

  setFinalStatus(runId, 'completed')
  console.log('\nStatus: completed')
  return { runId, status: 'completed' }
}

if (process.argv[1]?.endsWith('run.mjs')) {
  const opts = parseArgs(process.argv.slice(2))
  runAdaptiveDirector(opts).catch(err => {
    console.error(err.message)
    process.exit(1)
  })
}

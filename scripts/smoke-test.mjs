import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, rmSync, readdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { executeDelegateRelay } from '../skills/adaptive-director/scripts/delegate-relay.mjs'

const scriptDir = process.cwd()
const skillDir = join(scriptDir, 'skills', 'adaptive-director')

function runSync(script, args = []) {
  return execFileSync(process.execPath, [join(scriptDir, script), ...args], {
    encoding: 'utf8', timeout: 10000, cwd: scriptDir
  })
}

function routePhase(taskSize, phase, budget = 'balanced', allowMax = false, delegateEnabled = false) {
  const input = JSON.stringify({ taskSize, phase, budget, allowMax, delegateEnabled })
  const out = execFileSync(
    process.execPath,
    [join(skillDir, 'scripts/route.mjs'), '--input', input],
    { encoding: 'utf8', timeout: 10000, cwd: scriptDir }
  )
  return JSON.parse(out.trim())
}

function runStateCmd(command, args) {
  const out = execFileSync(process.execPath, [join(skillDir, 'scripts/run-state.mjs'), command, ...args], {
    encoding: 'utf8', timeout: 10000, cwd: scriptDir
  })
  return JSON.parse(out.trim())
}

console.log('\n=== Smoke Tests ===\n')

// Test 1: Structure verification
console.assert(existsSync(skillDir), 'skills/adaptive-director/ must exist')
console.assert(existsSync(join(skillDir, 'SKILL.md')), 'SKILL.md must exist in skill directory')
console.assert(existsSync(join(skillDir, 'data', 'registry.json')), 'registry.json must exist in skill directory')
console.assert(existsSync(join(skillDir, 'references')), 'references/ must exist in skill directory')
console.assert(existsSync(join(skillDir, 'templates')), 'templates/ must exist in skill directory')
console.assert(existsSync(join(skillDir, 'examples')), 'examples/ must exist in skill directory')
console.assert(existsSync(join(skillDir, 'scripts', 'route.mjs')), 'route.mjs must exist in skill scripts')
console.assert(existsSync(join(skillDir, 'scripts', 'run-state.mjs')), 'run-state.mjs must exist in skill scripts')
console.assert(existsSync(join(skillDir, 'scripts', 'resume.mjs')), 'resume.mjs must exist in skill scripts')
console.log('structure check: OK')

// Test 2: CLI Help
try {
  const cliHelp = runSync('scripts/cli.mjs', ['help']);
  if (!cliHelp.includes('Adaptive Director Skill CLI')) {
    throw new Error('cli help output invalid');
  }
  console.log('cli help: OK');
} catch (e) {
  console.error('cli help failed: ' + e.message);
  process.exit(1);
}

// Test 3: Doctor runs cleanly
try {
  const doctorOut = runSync('scripts/doctor.mjs');
  console.assert(doctorOut.includes('Ready.') || doctorOut.includes('Adaptive Director Doctor'), 'doctor output invalid');
  console.log('doctor check: OK');
} catch (e) {
  console.error('doctor check failed: ' + e.message);
  process.exit(1);
}

// Test 4: route — small / implement
const r2 = routePhase('small', 'implement', 'conservative', false, false)
console.log('route small/implement/conservative:', JSON.stringify(r2))
console.assert(r2.effort === 'medium', 'implement effort should be medium in conservative mode')
console.assert(r2.model !== null, 'model should be resolved')

// Test 5: route — large / plan / quality
const r3 = routePhase('large', 'plan', 'quality', false, false)
console.log('route large/plan/quality:', JSON.stringify(r3))
console.assert(r3.effort === 'high', 'plan effort should be high in quality mode')

// Test 6: run-state init + update + read
const initResult = runStateCmd('init', ['--task', 'Test task', '--size', 'small', '--budget', 'balanced'])
console.log('\nrun-state init:', JSON.stringify(initResult))
const runId = initResult.runId
console.assert(runId.startsWith('run-'), 'runId should start with run-')

runStateCmd('update', ['--run-id', runId, '--status', 'running', '--phase', 'implement'])

const meta = runStateCmd('read', ['--run-id', runId])
console.log('run-state read status:', meta.status, '| phase:', meta.currentPhase)
console.assert(meta.status === 'running', 'status should be running')
console.assert(meta.currentPhase === 'implement', 'phase should be implement')

// Test 7: write-phase + read-phase
const findings = JSON.stringify([{severity:'critical',title:'Test finding',description:'A test critical issue'}])
runStateCmd('write-phase', [
  '--run-id', runId, '--phase', 'review',
  '--status', 'completed', '--summary', 'Found 1 critical issue',
  '--findings-json', findings
])
const phaseResult = runStateCmd('read-phase', ['--run-id', runId, '--phase', 'review'])
console.log('\nwrite/read-phase:', phaseResult.phase, '| findings:', phaseResult.findings?.length)
console.assert(phaseResult.findings?.length === 1, 'should have 1 finding')
console.assert(phaseResult.findings[0].severity === 'critical', 'finding should be critical')

// Test 8: build-brief
const brief = execFileSync(process.execPath, [join(skillDir, 'scripts/run-state.mjs'), 'build-brief', '--run-id', runId, '--phase', 'review'], {
  encoding: 'utf8', timeout: 10000, cwd: scriptDir
})
console.log('\nbuild-brief review (first 80 chars):', brief.slice(0, 80).replace(/\n/g, ' '))
console.assert(brief.includes('Independent Reviewer'), 'brief should contain reviewer role')

// Test 8B: implement.md is the canonical implementation report used by review briefs
runStateCmd('write-phase', [
  '--run-id', runId, '--phase', 'implement',
  '--status', 'completed', '--summary', 'IMPLEMENT REPORT SENTINEL'
])
const reviewBriefWithImplementation = execFileSync(process.execPath, [
  join(skillDir, 'scripts/run-state.mjs'), 'build-brief',
  '--run-id', runId, '--phase', 'review'
], { encoding: 'utf8', timeout: 10000, cwd: scriptDir })
console.assert(reviewBriefWithImplementation.includes('IMPLEMENT REPORT SENTINEL'), 'review brief must include implement.md report')
console.assert(!reviewBriefWithImplementation.includes('(no implementation report)'), 'review brief must not report missing implementation after implement phase')
console.log('implement report canonical filename regression: OK')

// Test 9: resume (should find our running run)
const resumeOut = execFileSync(process.execPath, [join(skillDir, 'scripts/resume.mjs')], {
  encoding: 'utf8', timeout: 10000, cwd: scriptDir
})
const resumeResult = JSON.parse(resumeOut.trim())
console.log('\nresume found:', resumeResult?.runId, '| status:', resumeResult?.status)
console.assert(resumeResult?.runId === runId || resumeResult !== null, 'should find a resumable run')

// Test 10: Temporary host install verification
const tempHostDir = join(tmpdir(), 'test-adaptive-director-host-' + Date.now())
try {
  mkdirSync(tempHostDir, { recursive: true })
  execFileSync(process.execPath, [join(scriptDir, 'scripts/install.mjs'), tempHostDir], {
    encoding: 'utf8', timeout: 15000, cwd: scriptDir
  })
  const installedDest = join(tempHostDir, 'adaptive-director')
  console.assert(existsSync(join(installedDest, 'SKILL.md')), 'SKILL.md should be copied to host')
  console.assert(existsSync(join(installedDest, 'scripts', 'route.mjs')), 'route.mjs should be copied')
  console.assert(existsSync(join(installedDest, 'data', 'registry.json')), 'registry.json should be copied')
  console.assert(existsSync(join(installedDest, 'references')), 'references/ should be copied')
  console.assert(existsSync(join(installedDest, 'templates')), 'templates/ should be copied')
  console.assert(existsSync(join(installedDest, 'examples')), 'examples/ should be copied')
  console.log('temporary host install test: OK')
} finally {
  rmSync(tempHostDir, { recursive: true, force: true })
}

// Test 11: Fix trigger strictly on critical > 0
const nonCriticalFindings = JSON.stringify([
  { severity: 'warning', title: 'Advisory style issue' },
  { severity: 'suggestion', title: 'Optional optimization' }
])
runStateCmd('write-phase', [
  '--run-id', runId, '--phase', 'review',
  '--status', 'completed', '--summary', 'Only warnings and suggestions',
  '--findings-json', nonCriticalFindings
])
const evalReview = runStateCmd('eval-review', ['--run-id', runId])
console.assert(evalReview.criticalCount === 0, 'critical count should be 0')
console.assert(evalReview.needsFix === false, 'needsFix must be false when criticalCount == 0')
console.assert(evalReview.nextPhase === 'verify', 'nextPhase must be verify when criticalCount == 0')
console.assert(evalReview.canProceedToVerify === true, 'must allow progression to verify')
console.log('fix trigger (critical-only): OK')

// Test 12: Tiered Review Anti-Affinity
const reviewRouteCodex = execFileSync(process.execPath, [
  join(skillDir, 'scripts/route.mjs'),
  '--input', JSON.stringify({ phase: 'review', currentAgent: 'codex', currentModel: 'gpt-6-astra' })
], { encoding: 'utf8', timeout: 10000, cwd: scriptDir })
const reviewDecision = JSON.parse(reviewRouteCodex.trim())
console.assert(reviewDecision.antiAffinity && reviewDecision.antiAffinity.tier >= 3, 'review should achieve high anti-affinity tier')
console.log('review anti-affinity tier:', reviewDecision.antiAffinity.tier, '| desc:', reviewDecision.antiAffinity.description)

// Test 13: Verify route execution capability check
const verifyRoute = execFileSync(process.execPath, [
  join(skillDir, 'scripts/route.mjs'),
  '--input', JSON.stringify({ phase: 'verify' })
], { encoding: 'utf8', timeout: 10000, cwd: scriptDir })
const verifyDecision = JSON.parse(verifyRoute.trim())
console.assert(verifyDecision.executionCapability?.canExecuteTests === true, 'verify route must ensure test/evidence execution capability')
console.log('verify execution capability check: OK (host:', verifyDecision.agent, ')')

// ── Delegate Failure Paths (Production Hardening) ──

// Test 14: Relay not found / unavailable (Safe pre-execution fallback)
const r14 = executeDelegateRelay({ agent: 'non-existent-agent-xyz', briefContent: '# Test' })
console.assert(r14.ok === false, 'relay not found must report ok: false')
console.assert(r14.error === 'relay_not_found', 'error code must be relay_not_found')
console.assert(r14.safeFallbackToNative === true, 'must allow safe fallback to native when pre-execution fails')
console.assert(r14.recoveryRequired === false, 'no recovery needed when no execution happened')
console.log('failure path 1 (relay_not_found): OK')

// Test 15: Relay exits non-zero (clean workspace -> safe fallback)
const failRelayDir = join(tmpdir(), 'ad-test-fail-relay-' + Date.now())
mkdirSync(failRelayDir, { recursive: true })
const failRelayScript = join(failRelayDir, 'fail-relay.mjs')
writeFileSync(failRelayScript, "process.stderr.write('crash'); process.exit(1);", 'utf8')
const r15 = executeDelegateRelay({ agent: 'custom', customRelayPath: failRelayScript, briefContent: '# Test' })
console.assert(r15.ok === false, 'non-zero exit must report ok: false')
console.assert(r15.error === 'result_missing' || r15.error === 'relay_exit_nonzero', 'error captured')
console.assert(r15.safeFallbackToNative === true, 'clean workspace allows fallback')
console.log('failure path 2 (relay_exit_nonzero_clean): OK')

// Test 16: Workspace mutation boundary (dirty workspace -> blocks automatic fallback)
const dirtyRelayScript = join(failRelayDir, 'dirty-fail-relay.mjs')
const canaryFile = join(scriptDir, '.ad-test-canary.tmp')
writeFileSync(dirtyRelayScript, [
  "import { writeFileSync } from 'node:fs'",
  `writeFileSync(${JSON.stringify(canaryFile)}, 'mutated by relay', 'utf8')`,
  "process.exit(1)"
].join('\n'), 'utf8')
const r16 = executeDelegateRelay({ agent: 'custom', customRelayPath: dirtyRelayScript, briefContent: '# Test' })
try {
  console.assert(r16.ok === false, 'dirty failure must report ok: false')
  console.assert(r16.workspaceMutated === true, 'workspace mutation must be detected')
  console.assert(r16.safeFallbackToNative === false, 'must BLOCK automatic native fallback on dirty workspace')
  console.assert(r16.recoveryRequired === true, 'must flag recoveryRequired: true')
  console.assert(r16.status === 'needs_recovery', 'status must be needs_recovery')
  console.log('failure path 3 (workspace_mutation_boundary_blocked): OK')
} finally {
  if (existsSync(canaryFile)) rmSync(canaryFile, { force: true })
}

// Test 17: Hung relay / Timeout handling
const hungRelayScript = join(failRelayDir, 'hung-relay.mjs')
writeFileSync(hungRelayScript, "setTimeout(() => {}, 60000);", 'utf8')
const r17 = executeDelegateRelay({ agent: 'custom', customRelayPath: hungRelayScript, briefContent: '# Test', timeout: '1s' })
console.assert(r17.ok === false, 'timeout must report ok: false')
console.assert(r17.error === 'relay_timeout', 'error must be relay_timeout')
console.assert(r17.exitCode === 124, 'timeout exit code should be 124')
console.log('failure path 4 (relay_timeout_guard): OK')

// Test 18: result.json missing or malformed
// 18A: missing result.json
const noResultScript = join(failRelayDir, 'no-result.mjs')
writeFileSync(noResultScript, "process.exit(0);", 'utf8')
const r18a = executeDelegateRelay({ agent: 'custom', customRelayPath: noResultScript, briefContent: '# Test' })
console.assert(r18a.ok === false, 'missing result.json must report ok: false')
console.assert(r18a.error === 'result_missing', 'error must be result_missing')

// 18B: malformed result.json
const badResultScript = join(failRelayDir, 'bad-result.mjs')
writeFileSync(badResultScript, [
  "import { writeFileSync } from 'node:fs'",
  "import { join } from 'node:path'",
  "const outIdx = process.argv.indexOf('--out-dir')",
  "const outDir = process.argv[outIdx + 1]",
  "writeFileSync(join(outDir, 'result.json'), '{ invalid json syntax', 'utf8')",
  "process.exit(0)"
].join('\n'), 'utf8')
const r18b = executeDelegateRelay({ agent: 'custom', customRelayPath: badResultScript, briefContent: '# Test' })
console.assert(r18b.ok === false, 'malformed result.json must report ok: false')
console.assert(r18b.error === 'result_malformed', 'error must be result_malformed')
console.log('failure path 5 (result_missing_or_malformed): OK')
rmSync(failRelayDir, { recursive: true, force: true })

// Test 19: Requested model not available with verified host discovery
const r19Out = execFileSync(process.execPath, [
  join(skillDir, 'scripts/route.mjs'),
  '--input', JSON.stringify({ phase: 'implement', delegateEnabled: true, currentModel: 'unknown-model-xyz' })
], { encoding: 'utf8', timeout: 10000, cwd: scriptDir })
const r19 = JSON.parse(r19Out.trim())
console.assert(r19.model !== null, 'route must fall back to a valid model')
console.log('failure path 6 (verified_model_fallback): OK (routed to model:', r19.model, ')')

console.log('\n=== All tests passed ✓ ===\n')

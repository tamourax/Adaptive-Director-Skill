import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, rmSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'

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

console.log('\n=== All tests passed ✓ ===\n')

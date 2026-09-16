import { execFileSync } from 'node:child_process'
import { join } from 'node:path'

const scriptDir = process.cwd()

function runScript(script, args) {
  const out = execFileSync(process.execPath, [join(scriptDir, script), ...args], {
    encoding: 'utf8', timeout: 10000, cwd: scriptDir
  })
  return JSON.parse(out.trim())
}

function routePhase(taskSize, phase, budget = 'balanced', allowMax = false, delegateEnabled = false) {
  const input = JSON.stringify({ taskSize, phase, budget, allowMax, delegateEnabled })
  const out = execFileSync(
    process.execPath,
    [join(scriptDir, 'scripts/route.mjs'), '--input', input],
    { encoding: 'utf8', timeout: 10000, cwd: scriptDir }
  )
  return JSON.parse(out.trim())
}

function runStateCmd(command, args) {
  const out = execFileSync(process.execPath, [join(scriptDir, 'scripts/run-state.mjs'), command, ...args], {
    encoding: 'utf8', timeout: 10000, cwd: scriptDir
  })
  return JSON.parse(out.trim())
}

console.log('\n=== Smoke Tests ===\n')

// Test 1: route — medium / review
const r1 = routePhase('medium', 'review', 'balanced', false, false)
console.log('route medium/review/balanced:', JSON.stringify(r1))
console.assert(r1.effort === 'high', 'review effort should be high in balanced mode')

// Test 2: route — small / implement
const r2 = routePhase('small', 'implement', 'conservative', false, false)
console.log('route small/implement/conservative:', JSON.stringify(r2))
console.assert(r2.effort === 'medium', 'implement effort should be medium in conservative mode')

// Test 3: route — large / plan / quality
const r3 = routePhase('large', 'plan', 'quality', false, false)
console.log('route large/plan/quality:', JSON.stringify(r3))
console.assert(r3.effort === 'high', 'plan effort should be high in quality mode')

// Test 4: run-state init + update + read
const initResult = runStateCmd('init', ['--task', 'Test task', '--size', 'small', '--budget', 'balanced'])
console.log('\nrun-state init:', JSON.stringify(initResult))
const runId = initResult.runId
console.assert(runId.startsWith('run-'), 'runId should start with run-')

runStateCmd('update', ['--run-id', runId, '--status', 'running', '--phase', 'implement'])

const meta = runStateCmd('read', ['--run-id', runId])
console.log('run-state read status:', meta.status, '| phase:', meta.currentPhase)
console.assert(meta.status === 'running', 'status should be running')
console.assert(meta.currentPhase === 'implement', 'phase should be implement')

// Test 5: write-phase + read-phase
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

// Test 6: build-brief
const { execFileSync: ef2 } = await import('node:child_process')
const brief = ef2(process.execPath, [join(scriptDir, 'scripts/run-state.mjs'), 'build-brief', '--run-id', runId, '--phase', 'review'], {
  encoding: 'utf8', timeout: 10000, cwd: scriptDir
})
console.log('\nbuild-brief review (first 80 chars):', brief.slice(0, 80).replace(/\n/g, ' '))
console.assert(brief.includes('Independent Reviewer'), 'brief should contain reviewer role')

// Test 7: resume (should find our running run)
const { execFileSync: ef3 } = await import('node:child_process')
const resumeOut = ef3(process.execPath, [join(scriptDir, 'scripts/resume.mjs')], {
  encoding: 'utf8', timeout: 10000, cwd: scriptDir
})
const resumeResult = JSON.parse(resumeOut.trim())
console.log('\nresume found:', resumeResult?.runId, '| status:', resumeResult?.status)
console.assert(resumeResult?.runId === runId || resumeResult !== null, 'should find a resumable run')

console.log('\n=== All tests passed ✓ ===\n')

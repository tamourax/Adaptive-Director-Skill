import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, writeFileSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { executeDelegateRelay } from '../skills/adaptive-director/scripts/delegate-relay.mjs'

const root = process.cwd()
const runState = join(root, 'skills', 'adaptive-director', 'scripts', 'run-state.mjs')

function runWorkflow(scenario, task) {
  const env = { ...process.env, AD_RUN_MOCK_SCENARIO: scenario }
  const out = execFileSync(process.execPath, [join(root, 'scripts/cli.mjs'), 'run', task], {
    cwd: root,
    env,
    encoding: 'utf8',
    timeout: 30000,
  })
  const match = out.match(/Run:\s+(run-[a-f0-9]+)/)
  if (!match) throw new Error(`Could not parse run id from output:\n${out}`)
  return { runId: match[1], out }
}

function readRun(runId) {
  const out = execFileSync(process.execPath, [runState, 'read', '--run-id', runId], {
    cwd: root,
    encoding: 'utf8',
    timeout: 10000,
  })
  return JSON.parse(out)
}

function readPhase(runId, phase) {
  const out = execFileSync(process.execPath, [runState, 'read-phase', '--run-id', runId, '--phase', phase], {
    cwd: root,
    encoding: 'utf8',
    timeout: 10000,
  })
  return JSON.parse(out)
}

function buildBrief(runId, phase) {
  return execFileSync(process.execPath, [runState, 'build-brief', '--run-id', runId, '--phase', phase], {
    cwd: root,
    encoding: 'utf8',
    timeout: 10000,
  })
}

console.log('\n=== End-to-End Run Flow Tests ===\n')

// TEST A: happy path
const happy = runWorkflow('happy', 'Add refresh-token authentication')
const happyMeta = readRun(happy.runId)
console.assert(happyMeta.status === 'completed', 'happy path final status must be completed')
for (const phase of ['plan', 'implement', 'review', 'verify']) {
  console.assert(readPhase(happy.runId, phase), `happy path must write ${phase} result`)
}
console.assert(happyMeta.routing.length >= 4, 'happy path must persist routing for all phases')
const happyReviewBrief = buildBrief(happy.runId, 'review')
console.assert(happyReviewBrief.includes('Mock implementation report'), 'review brief must contain implementation report')
console.assert(!happyReviewBrief.includes('(no implementation report)'), 'review brief must not say implementation report is missing')
console.log('TEST A happy path: OK')

// TEST B: critical fix path
const critical = runWorkflow('critical-fix', 'Refactor architecture for refresh-token authentication')
const criticalMeta = readRun(critical.runId)
console.assert(criticalMeta.status === 'completed', 'critical fix path final status must be completed')
console.assert(readPhase(critical.runId, 'fix'), 'critical fix path must write fix result')
console.assert(readPhase(critical.runId, 'review-rereview'), 'critical fix path must write re-review result')
const staticLargeMap = JSON.parse(execFileSync(process.execPath, ['-e', "const r=require('./skills/adaptive-director/data/registry.json'); console.log(JSON.stringify(r.phase_map.large))"], {
  cwd: root,
  encoding: 'utf8',
}))
console.assert(!staticLargeMap.includes('fix'), 'fix must not be part of static large phase map')
console.log('TEST B critical fix path: OK')

// TEST C: blocked path after one fix cycle
const blocked = runWorkflow('blocked', 'Refactor architecture with persistent critical issue')
const blockedMeta = readRun(blocked.runId)
console.assert(blockedMeta.status === 'blocked', 'blocked path final status must be blocked')
const blockedReviewRoutes = blockedMeta.routing.filter(r => r.phase === 'review' || r.phase === 'review-rereview')
console.assert(blockedReviewRoutes.length === 2, 'blocked path must stop after one re-review')
console.log('TEST C blocked path: OK')

// TEST D: delegate mutation failure blocks unsafe native fallback
const tempRepo = join(tmpdir(), `ad-delegate-mutation-${Date.now()}`)
mkdirSync(tempRepo, { recursive: true })
execFileSync('git', ['init'], { cwd: tempRepo, stdio: 'ignore' })
writeFileSync(join(tempRepo, 'README.md'), '# temp\n', 'utf8')
execFileSync('git', ['add', 'README.md'], { cwd: tempRepo, stdio: 'ignore' })
execFileSync('git', ['-c', 'user.email=test@example.com', '-c', 'user.name=Test', 'commit', '-m', 'init'], { cwd: tempRepo, stdio: 'ignore' })
const relayPath = join(tempRepo, 'dirty-fail-relay.mjs')
writeFileSync(relayPath, [
  "import { writeFileSync } from 'node:fs'",
  "import { join } from 'node:path'",
  "const cdIdx = process.argv.indexOf('--cd')",
  "const cwd = process.argv[cdIdx + 1]",
  "writeFileSync(join(cwd, 'mutated.txt'), 'mutation before failure', 'utf8')",
  "process.exit(1)",
].join('\n'), 'utf8')
try {
  const relayResult = executeDelegateRelay({ agent: 'custom', customRelayPath: relayPath, briefContent: '# test', cwd: tempRepo })
  console.assert(relayResult.ok === false, 'delegate mutation failure must fail')
  console.assert(relayResult.workspaceMutated === true, 'delegate mutation failure must detect workspace mutation')
  console.assert(relayResult.safeFallbackToNative === false, 'delegate mutation failure must block native fallback')
  console.assert(relayResult.status === 'needs_recovery', 'delegate mutation failure must require recovery')
  console.log('TEST D delegate mutation failure: OK')
} finally {
  rmSync(tempRepo, { recursive: true, force: true })
}

// TEST E: routing persistence survives a read/restart boundary
const routeMeta = readRun(happy.runId)
console.assert(Array.isArray(routeMeta.routing), 'routing history must be an array')
console.assert(routeMeta.routing.some(r => r.phase === 'review' && r.agent), 'routing history must include review agent')
console.assert(routeMeta.evidence?.commands?.length >= 1, 'verification evidence must persist in metadata')
console.log('TEST E routing persistence: OK')

console.log('\n=== End-to-End Run Flow Tests Passed ===\n')

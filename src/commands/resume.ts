import chalk from 'chalk'
import type { Phase } from '../types/index.js'
import {
  readMetadata,
  buildBrief,
  writePhaseResult,
  updateMetadata,
  listRuns,
} from '../core/handoff.js'
import { createExecutor }  from '../execution/executor.js'
import { analyseReview }   from '../core/reviewer.js'
import { verify }          from '../core/verifier.js'
import { detectProjectType } from '../discovery/project.js'

// ─── Resume ───────────────────────────────────────────────────────────────────

export async function resume(runIdOrLast: string | 'last'): Promise<void> {
  // Resolve run ID
  let runId = runIdOrLast
  if (runIdOrLast === 'last') {
    const runs = listRuns()
    const interrupted = runs.find(
      (r) => r.status === 'interrupted' || r.status === 'running'
    )
    if (!interrupted) {
      console.error(chalk.red('  No interrupted run found.'))
      process.exit(1)
    }
    runId = interrupted.runId
  }

  const meta = readMetadata(runId)
  if (!meta) {
    console.error(chalk.red(`  Run not found: ${runId}`))
    process.exit(1)
  }

  if (meta.status === 'verified') {
    console.log(chalk.green(`  Run ${runId} already verified. Nothing to resume.`))
    return
  }

  console.log(chalk.bold('\n  Adaptive Orchestrator — Resume\n'))
  console.log(`  Resuming run: ${chalk.dim(runId)}`)
  console.log(`  Last status:  ${chalk.yellow(meta.status)}`)
  console.log(`  Last phase:   ${chalk.yellow(meta.currentPhase ?? 'none')}\n`)

  // Mark as running again
  updateMetadata(runId, { status: 'running' })

  const projectType = detectProjectType()
  const phases: Phase[] = meta.routing.map((r) => r.phase)

  // Determine which phase to resume from
  const lastPhaseIndex = meta.currentPhase
    ? phases.indexOf(meta.currentPhase)
    : -1

  const resumeFrom = lastPhaseIndex >= 0 ? lastPhaseIndex : 0

  for (let i = resumeFrom; i < meta.routing.length; i++) {
    const route = meta.routing[i]
    const { phase } = route

    if (phase === 'fix') continue

    updateMetadata(runId, { currentPhase: phase })
    process.stdout.write(`  ↳ ${phase.padEnd(12)}`)

    const brief    = buildBrief(runId, phase)
    const executor = await createExecutor(route.execution)
    const result   = await executor.run(route, brief, runId)

    writePhaseResult(runId, result)

    if (result.status === 'failed') {
      console.log(chalk.red(' FAILED'))
      updateMetadata(runId, { status: 'failed' })
      console.log(chalk.red(`\n  ${result.summary.slice(0, 300)}\n`))
      return
    }

    if (phase === 'review') {
      const analysis = analyseReview(result)
      console.log(analysis.hasCritical
        ? chalk.yellow(` ⚠ ${analysis.criticals.length} CRITICAL`)
        : chalk.green(' ✓'))

      if (analysis.hasCritical) {
        updateMetadata(runId, { status: 'blocked' })
        console.log(chalk.yellow('\n  Review still has critical issues. Manual fix required.'))
        return
      }
      continue
    }

    if (phase === 'verify') {
      const verifyResult = verify(projectType)
      console.log(verifyResult.passed ? chalk.green(' ✓') : chalk.red(' FAILED'))
      updateMetadata(runId, {
        status: verifyResult.passed ? 'verified' : 'blocked',
      })
      if (verifyResult.passed) {
        console.log(chalk.green('\n  Status: Verified\n'))
      } else {
        console.log(chalk.yellow(`\n  Status: Blocked\n  ${verifyResult.summary}\n`))
      }
      return
    }

    console.log(chalk.green(' ✓'))
  }

  updateMetadata(runId, { status: 'verified' })
  console.log(chalk.green('\n  Status: Verified\n'))
}

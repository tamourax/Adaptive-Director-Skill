import { spawnSync } from 'node:child_process'
import type { ProjectType } from '../types/index.js'
import { getVerifyCommands } from '../discovery/project.js'

// ─── Verifier ─────────────────────────────────────────────────────────────────

export interface VerificationResult {
  passed:   boolean
  results:  CommandResult[]
  summary:  string
}

interface CommandResult {
  command: string
  exitCode: number
  output:  string
  passed:  boolean
}

/**
 * Run the project's verification commands (analyze, test, build).
 * Stops at the first failure.
 */
export function verify(projectType: ProjectType, cwd: string = process.cwd()): VerificationResult {
  const commands = getVerifyCommands(projectType)

  if (commands.length === 0) {
    return {
      passed:  true,
      results: [],
      summary: 'No verification commands configured for project type: ' + projectType,
    }
  }

  const results: CommandResult[] = []

  for (const cmdStr of commands) {
    const [cmd, ...args] = cmdStr.split(' ')

    const proc = spawnSync(cmd, args, {
      cwd,
      encoding:  'utf8',
      timeout:   5 * 60 * 1000,   // 5 minutes per command
      maxBuffer: 5 * 1024 * 1024,
      shell:     false,
    })

    const output   = ((proc.stdout ?? '') + (proc.stderr ?? '')).trim()
    const exitCode = proc.status ?? 1
    const passed   = exitCode === 0 && !proc.error

    results.push({ command: cmdStr, exitCode, output, passed })

    // Stop at first failure
    if (!passed) break
  }

  const allPassed = results.every((r) => r.passed)

  const summary = results
    .map((r) => `${r.passed ? '✓' : '✗'} ${r.command} (exit ${r.exitCode})`)
    .join('\n')

  return {
    passed:  allPassed,
    results,
    summary,
  }
}

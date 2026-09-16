import { spawnSync } from 'node:child_process'
import { writeFileSync, readFileSync, mkdirSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { randomBytes } from 'node:crypto'
import type { PhaseRoute, PhaseResult, Finding, ReviewSeverity } from '../types/index.js'
import type { IExecutor } from './executor.js'

// ─── NativeExecutor ───────────────────────────────────────────────────────────
//
// Runs the agent CLI directly as a child process.
// The agent reads the brief from a temp file and writes to stdout.
//
// Supported agents and their headless brief-delivery method:
//   claude  → claude --print -p @<brief-file>
//   codex   → codex -p @<brief-file>  (or --message-file)
//   agy     → agy --print -p @<brief-file>
//   gemini  → gemini -p @<brief-file>
//
// The executor captures stdout, parses findings if the phase is 'review',
// and writes a PhaseResult.

type AgentLauncher = (briefPath: string, route: PhaseRoute) => { cmd: string; args: string[] }

const LAUNCHERS: Record<string, AgentLauncher> = {
  claude: (briefPath, route) => ({
    cmd: 'claude',
    args: [
      '--print',
      '-p', `@${briefPath}`,
      '--effort', route.effort,
    ],
  }),
  codex: (briefPath, route) => ({
    cmd: 'codex',
    args: [
      '-p', `@${briefPath}`,
      '--effort', route.effort,
    ],
  }),
  agy: (briefPath, route) => ({
    cmd: 'agy',
    args: [
      '--print',
      '-p', `@${briefPath}`,
      '--effort', route.effort,
    ],
  }),
  gemini: (briefPath, _route) => ({
    cmd: 'gemini',
    args: ['-p', `@${briefPath}`],
  }),
}

function getDefaultLauncher(agentId: string): AgentLauncher {
  return (briefPath, route) => ({
    cmd: agentId,
    args: ['-p', `@${briefPath}`, '--effort', route.effort],
  })
}

// ─── Finding parser ───────────────────────────────────────────────────────────

const SEVERITY_PATTERN = /\b(CRITICAL|WARNING|SUGGESTION)\b[:\s]+(.+)/gi

function parseFindings(output: string): Finding[] {
  const findings: Finding[] = []
  let match: RegExpExecArray | null

  while ((match = SEVERITY_PATTERN.exec(output)) !== null) {
    findings.push({
      severity: match[1].toLowerCase() as ReviewSeverity,
      title:    match[2].trim().slice(0, 120),
      description: match[2].trim(),
    })
  }

  return findings
}

// ─── Class ────────────────────────────────────────────────────────────────────

export class NativeExecutor implements IExecutor {
  async run(route: PhaseRoute, brief: string, _runDir: string): Promise<PhaseResult> {
    // Write brief to temp file
    const tmp = join(tmpdir(), `ao-brief-${randomBytes(4).toString('hex')}.md`)
    writeFileSync(tmp, brief, 'utf8')

    try {
      const launcher = LAUNCHERS[route.agent] ?? getDefaultLauncher(route.agent)
      const { cmd, args } = launcher(tmp, route)

      const result = spawnSync(cmd, args, {
        encoding: 'utf8',
        timeout:  10 * 60 * 1000,   // 10 minutes
        maxBuffer: 10 * 1024 * 1024, // 10 MB
      })

      if (result.error) {
        return {
          phase:   route.phase,
          status:  'failed',
          summary: `Agent launch failed: ${result.error.message}`,
        }
      }

      const output = (result.stdout ?? '') + (result.stderr ?? '')

      if (result.status !== 0) {
        return {
          phase:   route.phase,
          status:  'failed',
          summary: `Agent exited with code ${result.status ?? 'unknown'}.\n\n${output.slice(0, 2000)}`,
        }
      }

      const findings = route.phase === 'review' || route.phase === 'fix'
        ? parseFindings(output)
        : undefined

      return {
        phase:    route.phase,
        status:   'completed',
        summary:  output.trim(),
        findings,
      }
    } finally {
      // Clean up temp file
      try {
        const { unlinkSync } = await import('node:fs')
        unlinkSync(tmp)
      } catch { /* ignore */ }
    }
  }
}

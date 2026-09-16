import { spawnSync } from 'node:child_process'
import { writeFileSync, readFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir, homedir } from 'node:os'
import { randomBytes } from 'node:crypto'
import yaml from 'js-yaml'
import type { PhaseRoute, PhaseResult, Finding, ReviewSeverity } from '../types/index.js'
import type { IExecutor } from './executor.js'

// ─── delegate-skills relay paths ─────────────────────────────────────────────
//
// Each agent has its relay at:
//   ~/.skills/amElnagdy/delegate-skills/skills/<agent>-delegate/scripts/relay.mjs
// OR the local project install:
//   ./.skills/amElnagdy/delegate-skills/skills/<agent>-delegate/scripts/relay.mjs

function findRelay(agentId: string): string | null {
  const relayName = `${agentId}-delegate`
  const candidates = [
    join(process.cwd(), '.skills', 'amElnagdy', 'delegate-skills', 'skills', relayName, 'scripts', 'relay.mjs'),
    join(homedir(), '.skills', 'amElnagdy', 'delegate-skills', 'skills', relayName, 'scripts', 'relay.mjs'),
  ]
  return candidates.find(existsSync) ?? null
}

// ─── DelegateResult (delegate-relay.result.v1) ────────────────────────────────

interface DelegateResult {
  status:      'completed' | 'failed' | 'error'
  exitCode:    number
  report?:     string
  touchedFiles?: string[]
  sessionId?:    string
  signal?:       string
}

// ─── Finding parser (same as native-executor) ─────────────────────────────────

const SEVERITY_PATTERN = /\b(CRITICAL|WARNING|SUGGESTION)\b[:\s]+(.+)/gi

function parseFindings(output: string): Finding[] {
  const findings: Finding[] = []
  let match: RegExpExecArray | null
  while ((match = SEVERITY_PATTERN.exec(output)) !== null) {
    findings.push({
      severity:    match[1].toLowerCase() as ReviewSeverity,
      title:       match[2].trim().slice(0, 120),
      description: match[2].trim(),
    })
  }
  return findings
}

// ─── Class ────────────────────────────────────────────────────────────────────

export class DelegateExecutor implements IExecutor {
  async run(route: PhaseRoute, brief: string, _runDir: string): Promise<PhaseResult> {
    const relayPath = findRelay(route.agent)

    if (!relayPath) {
      return {
        phase:  route.phase,
        status: 'failed',
        summary: `Delegate relay not found for agent "${route.agent}". ` +
                 `Run: npx skills add amElnagdy/delegate-skills --skill ${route.agent}-delegate`,
      }
    }

    // Write brief to temp file
    const tmp = join(tmpdir(), `ao-brief-${randomBytes(4).toString('hex')}.md`)
    writeFileSync(tmp, brief, 'utf8')

    // Prepare result output path
    const resultPath = join(tmpdir(), `ao-result-${randomBytes(4).toString('hex')}.json`)

    try {
      const effortFlag = route.effort === 'max' ? '--effort max' : `--effort ${route.effort}`

      const result = spawnSync(
        'node',
        [
          relayPath,
          '--brief-file', tmp,
          '--out', resultPath,
          '--effort', route.effort,
        ],
        {
          encoding:  'utf8',
          timeout:   15 * 60 * 1000,   // 15 minutes
          maxBuffer: 10 * 1024 * 1024,
        }
      )

      if (result.error) {
        return {
          phase:   route.phase,
          status:  'failed',
          summary: `Relay launch failed: ${result.error.message}`,
        }
      }

      // Read structured result.json from delegate relay
      if (!existsSync(resultPath)) {
        return {
          phase:   route.phase,
          status:  'failed',
          summary: `Relay did not produce result.json. Exit code: ${result.status ?? 'unknown'}.\n${result.stderr ?? ''}`,
        }
      }

      const raw = readFileSync(resultPath, 'utf8')
      const delegateResult = JSON.parse(raw) as DelegateResult

      const output = delegateResult.report ?? ''
      const findings = (route.phase === 'review' || route.phase === 'fix')
        ? parseFindings(output)
        : undefined

      return {
        phase:        route.phase,
        status:       delegateResult.status === 'completed' ? 'completed' : 'failed',
        summary:      output,
        findings,
        touchedFiles: delegateResult.touchedFiles,
        sessionId:    delegateResult.sessionId,
      }
    } finally {
      try {
        const { unlinkSync } = await import('node:fs')
        unlinkSync(tmp)
        if (existsSync(resultPath)) unlinkSync(resultPath)
      } catch { /* ignore */ }
    }
  }
}

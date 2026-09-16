import type { PhaseResult, Finding } from '../types/index.js'

// ─── Reviewer ─────────────────────────────────────────────────────────────────

export interface ReviewAnalysis {
  hasCritical: boolean
  hasWarning:  boolean
  findings:    Finding[]
  criticals:   Finding[]
  warnings:    Finding[]
  suggestions: Finding[]
  summary:     string
}

/**
 * Analyse a completed review phase result.
 * The findings may come from:
 *   a) The structured JSON (review.json) — preferred
 *   b) Parsed from the text summary — fallback
 */
export function analyseReview(result: PhaseResult): ReviewAnalysis {
  const findings: Finding[] = result.findings ?? []

  const criticals   = findings.filter((f) => f.severity === 'critical')
  const warnings    = findings.filter((f) => f.severity === 'warning')
  const suggestions = findings.filter((f) => f.severity === 'suggestion')

  const summary = buildSummary(criticals, warnings, suggestions)

  return {
    hasCritical: criticals.length > 0,
    hasWarning:  warnings.length  > 0,
    findings,
    criticals,
    warnings,
    suggestions,
    summary,
  }
}

function buildSummary(
  criticals:   Finding[],
  warnings:    Finding[],
  suggestions: Finding[]
): string {
  const parts: string[] = []

  if (criticals.length > 0) {
    parts.push(`${criticals.length} CRITICAL issue(s):`)
    for (const f of criticals) {
      parts.push(`  • ${f.title}${f.file ? ` (${f.file})` : ''}`)
    }
  }

  if (warnings.length > 0) {
    parts.push(`${warnings.length} WARNING(s):`)
    for (const f of warnings) {
      parts.push(`  • ${f.title}`)
    }
  }

  if (suggestions.length > 0) {
    parts.push(`${suggestions.length} suggestion(s) (not blocking)`)
  }

  if (parts.length === 0) parts.push('No issues found.')

  return parts.join('\n')
}

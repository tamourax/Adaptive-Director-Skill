#!/usr/bin/env node
/**
 * route.mjs
 * ──────────
 * Deterministic routing script.
 * NO reasoning. Applies fixed rules only.
 *
 * Input (stdin JSON or --input flag):
 *   {
 *     "taskSize":        "small" | "medium" | "large",
 *     "phase":           "plan" | "implement" | "review" | "fix" | "verify",
 *     "budget":          "conservative" | "balanced" | "quality",
 *     "allowMax":        boolean,
 *     "delegateEnabled": boolean,
 *     "currentModel":    string   (optional, for role check)
 *   }
 *
 * Output (stdout JSON):
 *   {
 *     "agent":     string,
 *     "model":     string | null,
 *     "effort":    "low" | "medium" | "high" | "max",
 *     "execution": "native" | "delegate"
 *   }
 *
 * Usage:
 *   echo '{"taskSize":"medium","phase":"review","budget":"balanced","allowMax":false,"delegateEnabled":false}' | node scripts/route.mjs
 *   node scripts/route.mjs --input '{"taskSize":"medium",...}'
 */

import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { homedir } from 'node:os'

// ─── Registry ─────────────────────────────────────────────────────────────────

const REGISTRY_PATH = join(import.meta.dirname ?? '.', '../data/registry.json')

function loadRegistry() {
  if (!existsSync(REGISTRY_PATH)) {
    return { models: {}, effort_table: {}, phase_requirements: {} }
  }
  return JSON.parse(readFileSync(REGISTRY_PATH, 'utf8'))
}

// ─── User config ──────────────────────────────────────────────────────────────

const USER_CONFIG_PATH = join(homedir(), '.adaptive-orchestrator', 'config.yaml')

function loadUserConfig() {
  if (!existsSync(USER_CONFIG_PATH)) return {}
  // Simple YAML parser (key: value only, no nesting needed here)
  const raw = readFileSync(USER_CONFIG_PATH, 'utf8')
  const config = {}
  for (const line of raw.split('\n')) {
    const m = line.match(/^(\w[\w.]*?):\s*(.+)$/)
    if (m) config[m[1].trim()] = m[2].trim()
  }
  return config
}

// ─── Delegate fleet ───────────────────────────────────────────────────────────

function loadDelegateLanes() {
  const paths = [
    join(process.cwd(), '.delegate', 'fleet.yaml'),
    join(homedir(), '.delegate', 'fleet.yaml'),
  ]

  for (const p of paths) {
    if (!existsSync(p)) continue
    try {
      const raw = readFileSync(p, 'utf8')
      const lanes = {}
      let current = null
      for (const line of raw.split('\n')) {
        const laneMatch = line.match(/^  (\w[\w-]*):\s*$/)
        const implMatch = line.match(/^\s+implementer:\s*(.+)$/)
        const modelMatch = line.match(/^\s+model:\s*(.+)$/)
        const effortMatch = line.match(/^\s+effort:\s*(.+)$/)
        if (laneMatch)   { current = laneMatch[1]; lanes[current] = {} }
        if (current && implMatch)   lanes[current].agent  = implMatch[1].trim()
        if (current && modelMatch)  lanes[current].model  = modelMatch[1].trim()
        if (current && effortMatch) lanes[current].effort = effortMatch[1].trim()
      }
      return lanes
    } catch { continue }
  }
  return {}
}

// ─── Scoring ──────────────────────────────────────────────────────────────────

function modelScore(registry, modelId) {
  return (
    registry.models[modelId] ??
    registry.models[modelId?.toLowerCase()] ??
    registry.models['unknown'] ??
    { planning: 1, coding: 1, review: 1 }
  )
}

function meetsRequirement(registry, modelId, phase) {
  const score = modelScore(registry, modelId)
  const req   = registry.phase_requirements?.[phase] ?? {}
  if (req.min_planning && score.planning < req.min_planning) return false
  if (req.min_coding   && score.coding   < req.min_coding)   return false
  if (req.min_review   && score.review   < req.min_review)   return false
  return true
}

// Phase-relevant score for ranking
function phaseScore(registry, modelId, phase) {
  const s = modelScore(registry, modelId)
  if (phase === 'plan' || phase === 'review' || phase === 'verify') return s.planning + s.review
  return s.coding
}

// ─── Agent → representative model mapping ─────────────────────────────────────

const AGENT_MODEL_MAP = {
  claude:   'claude-sonnet-4-5',
  agy:      'claude-sonnet-4-5',
  codex:    'codex-default',
  gemini:   'gemini-2-5-pro',
  opencode: 'gpt-4o',
  aider:    'gpt-4o',
  cursor:   'claude-sonnet-4-5',
  cline:    'claude-sonnet-4-5',
  copilot:  'gpt-4o',
}

// Fallback priority order (best-to-acceptable)
const AGENT_PRIORITY_FOR_PLANNING = ['claude', 'agy', 'gemini', 'opencode', 'cursor', 'cline', 'copilot', 'aider', 'codex']
const AGENT_PRIORITY_FOR_CODING   = ['codex', 'aider', 'opencode', 'cursor', 'cline', 'claude', 'agy', 'copilot', 'gemini']

// ─── Main routing logic ───────────────────────────────────────────────────────

function route(input) {
  const {
    taskSize        = 'medium',
    phase           = 'implement',
    budget          = 'balanced',
    allowMax        = false,
    delegateEnabled = false,
    currentModel    = 'unknown',
  } = input

  const registry   = loadRegistry()
  const userConfig = loadUserConfig()
  const lanes      = loadDelegateLanes()

  // ── 1. User explicit override ────────────────────────────────────────────
  const overrideKey = `agentOverrides.${phase}`
  const explicitAgent = userConfig[overrideKey] ?? userConfig[`override_${phase}`]
  if (explicitAgent) {
    const effort = computeEffort(registry, budget, phase, allowMax)
    return { agent: explicitAgent, model: null, effort, execution: 'native' }
  }

  // ── 2. Delegate lane (only when delegate is enabled) ────────────────────
  if (delegateEnabled && Object.keys(lanes).length > 0) {
    const laneForPhase = findLaneForPhase(lanes, phase)
    if (laneForPhase) {
      const effort = laneForPhase.effort ?? computeEffort(registry, budget, phase, allowMax)
      return {
        agent:     laneForPhase.agent,
        model:     laneForPhase.model ?? null,
        effort,
        execution: 'delegate',
      }
    }
  }

  // ── 3. Built-in registry: best available agent for phase ─────────────────
  const priorityList = (phase === 'plan' || phase === 'review' || phase === 'verify')
    ? AGENT_PRIORITY_FOR_PLANNING
    : AGENT_PRIORITY_FOR_CODING

  for (const agentId of priorityList) {
    const modelId = AGENT_MODEL_MAP[agentId] ?? 'unknown'
    if (meetsRequirement(registry, modelId, phase)) {
      const effort = computeEffort(registry, budget, phase, allowMax)
      return { agent: agentId, model: modelId, effort, execution: 'native' }
    }
  }

  // ── 4. Fallback ──────────────────────────────────────────────────────────
  const effort = computeEffort(registry, budget, phase, allowMax)
  return { agent: 'claude', model: null, effort, execution: 'native' }
}

function findLaneForPhase(lanes, phase) {
  // Map phase to lane name heuristic
  const keywords = {
    plan:      ['plan', 'planning'],
    implement: ['feature', 'impl', 'code', 'build'],
    review:    ['review', 'check'],
    fix:       ['fix', 'repair', 'feature'],
    verify:    ['test', 'verify', 'qa'],
  }
  const keys = keywords[phase] ?? [phase]
  for (const key of keys) {
    for (const [name, lane] of Object.entries(lanes)) {
      if (name.toLowerCase().includes(key) && lane.agent) return lane
    }
  }
  // Return first lane as generic fallback if delegate is enabled
  const first = Object.values(lanes)[0]
  return first?.agent ? first : null
}

function computeEffort(registry, budget, phase, allowMax) {
  const table = registry.effort_table?.[budget] ?? {}
  let effort  = table[phase] ?? 'medium'
  if (effort === 'max' && !allowMax) effort = 'high'
  return effort
}

// ─── CLI ──────────────────────────────────────────────────────────────────────

async function main() {
  let input = {}

  const inputFlag = process.argv.indexOf('--input')
  if (inputFlag !== -1 && process.argv[inputFlag + 1]) {
    input = JSON.parse(process.argv[inputFlag + 1])
  } else if (!process.stdin.isTTY) {
    const chunks = []
    for await (const chunk of process.stdin) chunks.push(chunk)
    const raw = Buffer.concat(chunks).toString('utf8').trim()
    if (raw) input = JSON.parse(raw)
  }

  const result = route(input)
  process.stdout.write(JSON.stringify(result, null, 2) + '\n')
}

main().catch((err) => {
  process.stderr.write('route.mjs error: ' + err.message + '\n')
  process.exit(1)
})

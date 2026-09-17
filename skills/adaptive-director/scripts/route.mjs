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
import { join, dirname, resolve } from 'node:path'
import { homedir } from 'node:os'
import { fileURLToPath } from 'node:url'
import { discoverAllInstalledAgents } from './discover-models.mjs'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

// ─── Registry ─────────────────────────────────────────────────────────────────

const REGISTRY_PATH = resolve(__dirname, '../data/registry.json')

function loadRegistry() {
  if (!existsSync(REGISTRY_PATH)) {
    return { models: {}, effort_table: {}, phase_requirements: {} }
  }
  return JSON.parse(readFileSync(REGISTRY_PATH, 'utf8'))
}

// ─── User config ──────────────────────────────────────────────────────────────

const USER_CONFIG_PATH = existsSync(join(homedir(), '.adaptive-director', 'config.json'))
  ? join(homedir(), '.adaptive-director', 'config.json')
  : join(homedir(), '.adaptive-orchestrator', 'config.json')

function loadUserConfig() {
  if (!existsSync(USER_CONFIG_PATH)) return {}
  try {
    const raw = readFileSync(USER_CONFIG_PATH, 'utf8')
    return JSON.parse(raw)
  } catch {
    return {}
  }
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

function resolveModelAlias(registry, modelId) {
  if (!modelId) return 'unknown'
  const lower = modelId.toLowerCase()
  return registry.aliases?.[modelId] ?? registry.aliases?.[lower] ?? modelId
}

function modelScore(registry, modelId) {
  if (!modelId) return registry.models['unknown'] ?? { planning: 1, coding: 1, review: 1, verification: 1 }
  const resolved = resolveModelAlias(registry, modelId)
  const rLower = resolved.toLowerCase()
  const withHyphen = rLower.replace(/\./g, '-')
  const withDot = rLower.replace(/-/g, '.')
  const base = (
    registry.models[resolved] ??
    registry.models[rLower] ??
    registry.models[withHyphen] ??
    registry.models[withDot] ??
    registry.models['unknown'] ??
    { planning: 1, coding: 1, review: 1, verification: 1 }
  )
  return {
    ...base,
    verification: base.verification ?? base.review ?? base.planning ?? 1,
  }
}

function meetsRequirement(registry, modelId, phase) {
  const score = modelScore(registry, modelId)
  const req   = registry.phase_requirements?.[phase] ?? {}
  if (req.min_planning     && score.planning     < req.min_planning)     return false
  if (req.min_coding       && score.coding       < req.min_coding)       return false
  if (req.min_review       && score.review       < req.min_review)       return false
  if (req.min_verification && score.verification < req.min_verification) return false
  return true
}

// Phase-relevant score for ranking
function phaseScore(registry, modelId, phase) {
  const s = modelScore(registry, modelId)
  if (phase === 'plan' || phase === 'review') return s.planning + s.review
  if (phase === 'verify') return s.verification + s.planning
  return s.coding
}

// ─── Agent → representative model default hint ───────────────────────────────
// Default preference hint used when dynamic discovery is unavailable or unconfigured.

const AGENT_MODEL_MAP = {
  agy:      'gemini-3.8-flash',
  codex:    'gpt-6-astra',
  claude:   'claude-fable-5-1',
  gemini:   'gemini-3.8-flash',
  opencode: 'gpt-5.6-sol',
  aider:    'glm-5.3',
  cursor:   'claude-sonnet-5',
  cline:    'claude-sonnet-5',
  copilot:  'gpt-5.6-terra',
}

// Fallback priority order (best-to-acceptable)
const AGENT_PRIORITY_FOR_PLANNING = ['agy', 'claude', 'gemini', 'opencode', 'cursor', 'cline', 'copilot', 'aider', 'codex']
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
  const explicitAgent = userConfig?.overrides?.[phase] ?? userConfig[overrideKey] ?? userConfig[`override_${phase}`]
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

  // ── 3. Dynamic Host & Model Discovery Pipeline ───────────────────────────
  // Detect host → Detect actually available models → resolve aliases → intersect with registry → score compatible candidates → route → fallback
  const priorityList = (phase === 'plan' || phase === 'review' || phase === 'verify')
    ? AGENT_PRIORITY_FOR_PLANNING
    : AGENT_PRIORITY_FOR_CODING

  const installedAgents = discoverAllInstalledAgents(userConfig)

  // Collect candidate options from installed agents
  const eligibleCandidates = []

  for (const agentId of priorityList) {
    if (!installedAgents[agentId]) continue

    const availableModels = installedAgents[agentId].availableModels
    if (Array.isArray(availableModels) && availableModels.length > 0) {
      for (const rawModel of availableModels) {
        const canonicalId = resolveModelAlias(registry, rawModel)
        if (meetsRequirement(registry, canonicalId, phase)) {
          eligibleCandidates.push({
            agent: agentId,
            model: canonicalId,
            score: phaseScore(registry, canonicalId, phase),
            source: 'dynamic_discovery',
          })
        }
      }
    } else {
      // Installed agent but no local model cache found: check default hint
      const hintModel = AGENT_MODEL_MAP[agentId] ?? 'unknown'
      const canonicalId = resolveModelAlias(registry, hintModel)
      if (meetsRequirement(registry, canonicalId, phase)) {
        eligibleCandidates.push({
          agent: agentId,
          model: canonicalId,
          score: phaseScore(registry, canonicalId, phase),
          source: 'default_hint',
        })
      }
    }
  }

  // If eligible candidates were found among installed agents:
  if (eligibleCandidates.length > 0) {
    // Sort by:
    // 1. Agent priority index in priorityList (lower index = higher priority)
    // 2. Model score descending
    eligibleCandidates.sort((a, b) => {
      const pA = priorityList.indexOf(a.agent)
      const pB = priorityList.indexOf(b.agent)
      if (pA !== pB) return pA - pB
      return b.score - a.score
    })

    const best = eligibleCandidates[0]
    const effort = computeEffort(registry, budget, phase, allowMax)
    return { agent: best.agent, model: best.model, effort, execution: 'native' }
  }

  // ── 4. Fallback (if no installed agent meets requirement) ─────────────────
  for (const agentId of priorityList) {
    const hintModel = AGENT_MODEL_MAP[agentId] ?? 'unknown'
    const canonicalId = resolveModelAlias(registry, hintModel)
    if (meetsRequirement(registry, canonicalId, phase)) {
      const effort = computeEffort(registry, budget, phase, allowMax)
      return { agent: agentId, model: canonicalId, effort, execution: 'native' }
    }
  }

  const effort = computeEffort(registry, budget, phase, allowMax)
  return { agent: priorityList[0] ?? 'codex', model: null, effort, execution: 'native' }
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

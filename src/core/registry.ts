import { readFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { homedir } from 'node:os'
import { fileURLToPath } from 'node:url'
import yaml from 'js-yaml'
import type { CapabilityRegistry, CapabilityScore, Phase, PhaseRequirement } from '../types/index.js'

// ─── Paths ────────────────────────────────────────────────────────────────────

const __dirname = fileURLToPath(new URL('.', import.meta.url))
const BUILTIN_PATH = join(__dirname, '../data/built-in-registry.yaml')
const USER_OVERRIDE_PATH = join(homedir(), '.adaptive-orchestrator', 'registry.yaml')

// ─── Loader ───────────────────────────────────────────────────────────────────

function loadYaml(path: string): Partial<CapabilityRegistry> {
  if (!existsSync(path)) return {}
  const raw = readFileSync(path, 'utf8')
  return (yaml.load(raw) as Partial<CapabilityRegistry>) ?? {}
}

function mergeRegistries(
  base: CapabilityRegistry,
  override: Partial<CapabilityRegistry>
): CapabilityRegistry {
  return {
    models: { ...base.models, ...(override.models ?? {}) },
    phase_requirements: { ...base.phase_requirements, ...(override.phase_requirements ?? {}) },
  }
}

let _registry: CapabilityRegistry | null = null

export function loadRegistry(): CapabilityRegistry {
  if (_registry) return _registry

  const builtin = loadYaml(BUILTIN_PATH) as CapabilityRegistry
  const userOverride = loadYaml(USER_OVERRIDE_PATH)

  _registry = mergeRegistries(builtin, userOverride)
  return _registry
}

// ─── Lookups ──────────────────────────────────────────────────────────────────

/**
 * Get capability score for a model name.
 * Falls back to 'unknown' if the model isn't in the registry.
 */
export function getModelScore(modelId: string): CapabilityScore {
  const registry = loadRegistry()
  // Try exact match first, then lowercase, then 'unknown'
  return (
    registry.models[modelId] ??
    registry.models[modelId.toLowerCase()] ??
    registry.models['unknown'] ??
    { planning: 1, coding: 1, review: 1 }
  )
}

/**
 * Get minimum requirements for a phase.
 */
export function getPhaseRequirement(phase: Phase): PhaseRequirement {
  const registry = loadRegistry()
  return registry.phase_requirements[phase] ?? {}
}

/**
 * Check if a model meets the minimum requirements for a phase.
 */
export function modelMeetsPhase(modelId: string, phase: Phase): boolean {
  const score = getModelScore(modelId)
  const req   = getPhaseRequirement(phase)

  if (req.min_planning && score.planning < req.min_planning) return false
  if (req.min_coding   && score.coding   < req.min_coding)   return false
  if (req.min_review   && score.review   < req.min_review)   return false

  return true
}

/**
 * Given the current agent's model, determine its orchestrator role.
 */
export function resolveAgentRole(
  currentModel: string
): 'full-orchestrator' | 'partial-orchestrator' | 'coordinator-only' {
  const score = getModelScore(currentModel)

  const canPlan   = score.planning >= 3
  const canReview = score.review   >= 3
  const canCode   = score.coding   >= 2

  if (canPlan && canReview && canCode) return 'full-orchestrator'
  if (canPlan || canReview)           return 'partial-orchestrator'
  return 'coordinator-only'
}

// ─── Reset (for testing) ──────────────────────────────────────────────────────

export function _resetRegistry(): void {
  _registry = null
}

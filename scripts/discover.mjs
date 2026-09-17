#!/usr/bin/env node
/**
 * discover.mjs
 * ─────────────
 * Detects installed coding-agent CLIs and delegate-skills fleet.
 * Never guesses. If a capability cannot be verified, it is marked unknown/false.
 *
 * Output: JSON on stdout.
 *
 * Usage:
 *   node scripts/discover.mjs
 *   node scripts/discover.mjs --json   (same, explicit)
 */

import { execFileSync, execSync } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { homedir } from 'node:os'
import { discoverHostModels } from '../skills/adaptive-director/scripts/discover-models.mjs'

// ─── Known agents ─────────────────────────────────────────────────────────────

const KNOWN_AGENTS = [
  { id: 'claude',    bins: ['claude'],       versionArgs: ['--version'], skillPaths: ['.claude/skills', '.config/claude/skills'] },
  { id: 'codex',     bins: ['codex'],        versionArgs: ['--version'], skillPaths: ['.codex/skills'] },
  { id: 'agy',       bins: ['agy'],          versionArgs: ['--version'], skillPaths: ['.gemini/antigravity/builtin/skills', '.gemini/antigravity/skills', '.gemini/antigravity-ide/skills'] },
  { id: 'gemini',    bins: ['gemini'],       versionArgs: ['--version'], skillPaths: ['.gemini/skills'] },
  { id: 'opencode',  bins: ['opencode'],     versionArgs: ['--version'], skillPaths: ['.opencode/skills'] },
  { id: 'aider',     bins: ['aider'],        versionArgs: ['--version'], skillPaths: ['.aider/skills'] },
  { id: 'cursor',    bins: ['cursor-agent'], versionArgs: ['--version'], skillPaths: ['.cursor/skills'] },
  { id: 'cline',     bins: ['cline'],        versionArgs: ['--version'], skillPaths: ['.cline/skills'] },
  { id: 'copilot',   bins: ['copilot'],      versionArgs: ['--version'], skillPaths: ['.copilot/skills'] },
]

// ─── Helpers ──────────────────────────────────────────────────────────────────

function isOnPath(bin) {
  try {
    execSync(
      process.platform === 'win32' ? `where ${bin}` : `which ${bin}`,
      { stdio: 'ignore', timeout: 3000 }
    )
    return true
  } catch {
    return false
  }
}

function findBinary(bins) {
  for (const bin of bins) {
    if (isOnPath(bin)) return bin
  }
  return null
}

function getVersion(bin, args) {
  try {
    const out = execFileSync(bin, args, {
      encoding: 'utf8', timeout: 5000, stdio: ['ignore', 'pipe', 'ignore']
    })
    return out.trim().split('\n')[0].trim()
  } catch {
    return null
  }
}

// ─── Delegate-skills fleet ────────────────────────────────────────────────────

function readFleet(path) {
  if (!existsSync(path)) return null
  try {
    const raw = readFileSync(path, 'utf8')
    // Simple YAML lane parser (avoids dependency on js-yaml in scripts)
    const lanes = {}
    let currentLane = null
    for (const line of raw.split('\n')) {
      const laneMatch = line.match(/^  (\w[\w-]*):\s*$/)
      const implementerMatch = line.match(/^\s+implementer:\s*(.+)$/)
      const modelMatch = line.match(/^\s+model:\s*(.+)$/)
      const effortMatch = line.match(/^\s+effort:\s*(.+)$/)
      if (laneMatch) { currentLane = laneMatch[1]; lanes[currentLane] = {} }
      else if (currentLane && implementerMatch) lanes[currentLane].implementer = implementerMatch[1].trim()
      else if (currentLane && modelMatch)       lanes[currentLane].model       = modelMatch[1].trim()
      else if (currentLane && effortMatch)      lanes[currentLane].effort      = effortMatch[1].trim()
    }
    return Object.keys(lanes).length > 0 ? lanes : null
  } catch {
    return null
  }
}

function readJsonConfig(path) {
  if (!existsSync(path)) return null
  try {
    const raw = JSON.parse(readFileSync(path, 'utf8'))
    if (raw.lanes && typeof raw.lanes === 'object') {
      const result = {}
      for (const [lane, def] of Object.entries(raw.lanes)) {
        result[lane] = {
          agent: def.implementer ?? def.agent,
          model: def.model ?? null,
          effort: def.effort ?? def.variant ?? null,
          implementer: def.implementer ?? def.agent,
        }
      }
      return Object.keys(result).length > 0 ? result : null
    }
  } catch {}
  return null
}

function discoverDelegate() {
  const paths = [
    join(process.cwd(), '.delegate', 'fleet.yaml'),
    join(homedir(), '.delegate', 'fleet.yaml'),
    join(process.cwd(), '.delegate', 'config.json'),
    join(homedir(), '.config', 'delegate-skills', 'config.json'),
  ]

  let lanes = {}
  for (const p of paths) {
    if (p.endsWith('.json')) {
      const jsonLanes = readJsonConfig(p)
      if (jsonLanes) lanes = { ...lanes, ...jsonLanes }
    } else {
      const fleetLanes = readFleet(p)
      if (fleetLanes) lanes = { ...lanes, ...fleetLanes }
    }
  }

  // Check if delegate-skills is installed on disk
  const agentsSkillsDir = join(homedir(), '.agents', 'skills')
  const codexSkillsDir  = join(homedir(), '.codex', 'skills')
  const hasAgentsSkills = existsSync(join(agentsSkillsDir, 'delegate-setup')) ||
                          existsSync(join(agentsSkillsDir, 'codex-delegate')) ||
                          existsSync(join(agentsSkillsDir, 'agy-delegate')) ||
                          existsSync(join(codexSkillsDir, 'delegate-review-loop'))

  let hasSkillLock = false
  const skillLockPath = join(homedir(), '.agents', '.skill-lock.json')
  if (existsSync(skillLockPath)) {
    try {
      const lockContent = readFileSync(skillLockPath, 'utf8')
      if (lockContent.includes('delegate-skills')) hasSkillLock = true
    } catch {}
  }

  const installed = Object.keys(lanes).length > 0 || hasAgentsSkills || hasSkillLock

  // If installed but no explicit fleet lanes file configured, synthesize lanes from installed delegate skills
  if (installed && Object.keys(lanes).length === 0 && hasAgentsSkills) {
    if (existsSync(join(agentsSkillsDir, 'codex-delegate'))) {
      lanes.feature = { agent: 'codex', implementer: 'codex' }
      lanes.implement = { agent: 'codex', implementer: 'codex' }
      lanes.fix = { agent: 'codex', implementer: 'codex' }
    }
    if (existsSync(join(agentsSkillsDir, 'agy-delegate'))) {
      lanes.plan = { agent: 'agy', implementer: 'agy' }
      lanes.review = { agent: 'agy', implementer: 'agy' }
      lanes.verify = { agent: 'agy', implementer: 'agy' }
    }
  }

  return {
    installed,
    lanes,
    source: hasSkillLock ? 'amElnagdy/delegate-skills' : (hasAgentsSkills ? 'local-skills' : (Object.keys(lanes).length > 0 ? 'fleet-config' : null))
  }
}

// ─── Main ─────────────────────────────────────────────────────────────────────

function discover() {
  const agents = {}

  for (const desc of KNOWN_AGENTS) {
    const bin = findBinary(desc.bins)
    if (!bin) {
      agents[desc.id] = { installed: false, available: false }
      continue
    }

    const version = getVersion(bin, desc.versionArgs)
    let detectedSkillPath = null
    if (desc.skillPaths) {
      for (const sp of desc.skillPaths) {
        const fullPath = join(homedir(), sp)
        if (existsSync(fullPath)) {
          detectedSkillPath = fullPath
          break
        }
      }
    }

    agents[desc.id] = {
      installed:       true,
      available:       version !== null,
      version:         version ?? 'unknown',
      skillPath:       detectedSkillPath,
      hasSkill:        detectedSkillPath ? existsSync(join(detectedSkillPath, 'adaptive-director')) || existsSync(join(detectedSkillPath, 'Adaptive-Director')) || existsSync(join(detectedSkillPath, 'adaptive-director-skill')) : false,
      availableModels: discoverHostModels(desc.id),
    }
  }

  const delegateSkills = discoverDelegate()

  const result = { agents, delegateSkills }
  process.stdout.write(JSON.stringify(result, null, 2) + '\n')
}

discover()

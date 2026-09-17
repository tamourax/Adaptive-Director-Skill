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

function discoverDelegate() {
  const globalPath  = join(homedir(), '.delegate', 'fleet.yaml')
  const projectPath = join(process.cwd(), '.delegate', 'fleet.yaml')

  const globalLanes  = readFleet(globalPath)
  const projectLanes = readFleet(projectPath)

  if (!globalLanes && !projectLanes) {
    return { installed: false, lanes: {} }
  }

  const merged = { ...(globalLanes ?? {}), ...(projectLanes ?? {}) }
  return { installed: true, lanes: merged }
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
      installed:  true,
      available:  version !== null,
      version:    version ?? 'unknown',
      skillPath:  detectedSkillPath,
      hasSkill:   detectedSkillPath ? existsSync(join(detectedSkillPath, 'adaptive-director')) || existsSync(join(detectedSkillPath, 'Adaptive-Director')) || existsSync(join(detectedSkillPath, 'adaptive-director-skill')) : false
    }
  }

  const delegateSkills = discoverDelegate()

  const result = { agents, delegateSkills }
  process.stdout.write(JSON.stringify(result, null, 2) + '\n')
}

discover()

import { execFileSync, execSync } from 'node:child_process'
import type { AgentInfo } from '../types/index.js'

// ─── Known agents ─────────────────────────────────────────────────────────────

interface AgentDescriptor {
  id:       string
  binaries: string[]      // try in order; first found wins
  authCheck?: string[]    // command that exits 0 when authenticated
  supportsSubagents: boolean
  supportsDelegate:  boolean
}

const KNOWN_AGENTS: AgentDescriptor[] = [
  {
    id: 'claude',
    binaries: ['claude'],
    authCheck: ['claude', '--version'],
    supportsSubagents: true,
    supportsDelegate:  false,
  },
  {
    id: 'codex',
    binaries: ['codex'],
    authCheck: ['codex', '--version'],
    supportsSubagents: false,
    supportsDelegate:  true,
  },
  {
    id: 'agy',
    binaries: ['agy'],
    authCheck: ['agy', '--version'],
    supportsSubagents: true,
    supportsDelegate:  false,
  },
  {
    id: 'gemini',
    binaries: ['gemini'],
    authCheck: ['gemini', '--version'],
    supportsSubagents: false,
    supportsDelegate:  false,
  },
  {
    id: 'opencode',
    binaries: ['opencode'],
    authCheck: ['opencode', '--version'],
    supportsSubagents: false,
    supportsDelegate:  true,
  },
  {
    id: 'aider',
    binaries: ['aider'],
    authCheck: ['aider', '--version'],
    supportsSubagents: false,
    supportsDelegate:  true,
  },
  {
    id: 'cursor',
    binaries: ['cursor-agent'],
    authCheck: ['cursor-agent', '--version'],
    supportsSubagents: false,
    supportsDelegate:  true,
  },
]

// ─── Helpers ──────────────────────────────────────────────────────────────────

function isOnPath(bin: string): boolean {
  try {
    execSync(`where ${bin}`, { stdio: 'ignore' })
    return true
  } catch {
    try {
      execSync(`which ${bin}`, { stdio: 'ignore' })
      return true
    } catch {
      return false
    }
  }
}

function findBinary(binaries: string[]): string | null {
  for (const bin of binaries) {
    if (isOnPath(bin)) return bin
  }
  return null
}

function checkAuth(args: string[]): boolean {
  try {
    execFileSync(args[0], args.slice(1), { stdio: 'ignore', timeout: 5000 })
    return true
  } catch {
    return false
  }
}

// ─── Discovery ────────────────────────────────────────────────────────────────

export function discoverAgents(): AgentInfo[] {
  return KNOWN_AGENTS.map((desc) => {
    const bin = findBinary(desc.binaries)
    const available = bin !== null

    let authenticated = false
    let executable    = false

    if (available && desc.authCheck) {
      try {
        authenticated = checkAuth(desc.authCheck)
        executable    = authenticated
      } catch {
        authenticated = false
        executable    = false
      }
    } else if (available) {
      executable = true
    }

    return {
      id:                desc.id,
      available,
      authenticated,
      executable,
      models:            [],    // populated by delegate discovery if available
      supportsSubagents: desc.supportsSubagents,
      supportsDelegate:  desc.supportsDelegate,
    }
  })
}

/**
 * Get info for a single agent by ID.
 * Returns null if not in the known agents list.
 */
export function getAgentInfo(id: string): AgentInfo | null {
  return discoverAgents().find((a) => a.id === id) ?? null
}

#!/usr/bin/env node
/**
 * discover-models.mjs
 * ───────────────────
 * Dynamic runtime host and model discovery for Adaptive Director.
 * Detects installed agent CLIs and queries locally configured/cached models.
 * Zero external dependencies. Ultra-fast (< 15ms).
 */

import { existsSync, readFileSync } from 'node:fs'
import { join, delimiter } from 'node:path'
import { homedir } from 'node:os'

export const KNOWN_AGENTS = [
  { id: 'agy',      bins: ['agy'],                     skillPaths: ['.gemini/antigravity/builtin/skills', '.gemini/antigravity/skills'] },
  { id: 'codex',    bins: ['codex'],                   skillPaths: ['.codex/skills'] },
  { id: 'claude',   bins: ['claude'],                  skillPaths: ['.claude/skills', '.config/claude/skills'] },
  { id: 'gemini',   bins: ['gemini'],                  skillPaths: ['.gemini/skills'] },
  { id: 'opencode', bins: ['opencode'],                skillPaths: ['.opencode/skills'] },
  { id: 'aider',    bins: ['aider'],                   skillPaths: ['.aider/skills'] },
  { id: 'cursor',   bins: ['cursor-agent', 'cursor'], skillPaths: ['.cursor/skills'] },
  { id: 'cline',    bins: ['cline'],                   skillPaths: ['.cline/skills'] },
  { id: 'copilot',  bins: ['copilot', 'github-copilot-cli'], skillPaths: ['.copilot/skills'] },
]

export function isBinaryInPath(bin) {
  const pathDirs = (process.env.PATH || '').split(delimiter)
  const exts = process.platform === 'win32' ? ['.exe', '.cmd', '.bat', ''] : ['']
  for (const dir of pathDirs) {
    if (!dir) continue
    for (const ext of exts) {
      try {
        const candidate = join(dir, bin + ext)
        if (existsSync(candidate)) return true
      } catch {
        continue
      }
    }
  }
  return false
}

export function isAgentInstalled(agentId, userConfig = {}) {
  if (userConfig.hosts?.[agentId]?.installed !== undefined) {
    return Boolean(userConfig.hosts[agentId].installed)
  }
  const meta = KNOWN_AGENTS.find(a => a.id === agentId)
  if (!meta) return false

  // Check if binary is in PATH
  for (const bin of meta.bins) {
    if (isBinaryInPath(bin)) return true
  }

  return false
}

export function discoverHostModels(agentId, userConfig = {}) {
  // 1. Explicit user config override takes precedence
  const explicit = userConfig.hosts?.[agentId]?.models || userConfig.hosts?.[agentId]?.available_models
  if (Array.isArray(explicit) && explicit.length > 0) {
    return explicit
  }

  const models = new Set()

  switch (agentId) {
    case 'codex': {
      // Check .codex/models_cache.json
      const cachePath = join(homedir(), '.codex', 'models_cache.json')
      if (existsSync(cachePath)) {
        try {
          const raw = JSON.parse(readFileSync(cachePath, 'utf8'))
          const list = Array.isArray(raw) ? raw : (Array.isArray(raw.models) ? raw.models : Object.keys(raw.models || {}))
          for (const item of list) {
            const slug = typeof item === 'string' ? item : (item.slug || item.id || item.model || item.name)
            if (slug && !slug.toLowerCase().includes('review') && !slug.toLowerCase().includes('auto')) {
              models.add(slug)
            }
          }
        } catch {}
      }
      // Check .codex/config.toml
      const tomlPath = join(homedir(), '.codex', 'config.toml')
      if (existsSync(tomlPath)) {
        try {
          const text = readFileSync(tomlPath, 'utf8')
          for (const line of text.split('\n')) {
            const parts = line.split('=')
            if (parts.length >= 2 && parts[0].trim() === 'model') {
              const val = parts[1].trim().replace(/^['"]|['"]$/g, '')
              if (val) models.add(val)
            }
          }
        } catch {}
      }
      if (process.env.CODEX_MODEL) models.add(process.env.CODEX_MODEL.trim())
      break
    }

    case 'agy': {
      // Known models provided natively by Antigravity / Gemini ecosystem
      const knownAgy = [
        'gemini-3.8-flash',
        'gemini-3.1-pro',
        'claude-sonnet-4-6',
        'claude-opus-4-6-thinking',
        'gpt-oss-120b',
        'gemini-2-5-pro'
      ]
      for (const m of knownAgy) models.add(m)
      if (process.env.AGY_MODEL) models.add(process.env.AGY_MODEL.trim())
      if (process.env.ANTIGRAVITY_MODEL) models.add(process.env.ANTIGRAVITY_MODEL.trim())
      break
    }

    case 'claude': {
      const conf = join(homedir(), '.claude', 'config.json')
      if (existsSync(conf)) {
        try {
          const d = JSON.parse(readFileSync(conf, 'utf8'))
          if (d.model) models.add(d.model)
        } catch {}
      }
      if (process.env.CLAUDE_MODEL) models.add(process.env.CLAUDE_MODEL.trim())
      if (process.env.ANTHROPIC_MODEL) models.add(process.env.ANTHROPIC_MODEL.trim())
      break
    }

    case 'gemini': {
      const conf = join(homedir(), '.gemini', 'config.json')
      if (existsSync(conf)) {
        try {
          const d = JSON.parse(readFileSync(conf, 'utf8'))
          if (d.model) models.add(d.model)
        } catch {}
      }
      if (process.env.GEMINI_MODEL) models.add(process.env.GEMINI_MODEL.trim())
      break
    }

    case 'opencode': {
      const conf = join(homedir(), '.config', 'opencode', 'config.json')
      if (existsSync(conf)) {
        try {
          const d = JSON.parse(readFileSync(conf, 'utf8'))
          if (d.model) models.add(d.model)
        } catch {}
      }
      if (process.env.OPENCODE_MODEL) models.add(process.env.OPENCODE_MODEL.trim())
      break
    }

    case 'cursor': {
      if (process.env.CURSOR_MODEL) models.add(process.env.CURSOR_MODEL.trim())
      break
    }

    case 'aider': {
      const conf = join(homedir(), '.aider.conf.yml')
      if (existsSync(conf)) {
        try {
          const text = readFileSync(conf, 'utf8')
          for (const line of text.split('\n')) {
            const parts = line.split(':')
            if (parts.length >= 2 && parts[0].trim() === 'model') {
              const val = parts.slice(1).join(':').trim()
              if (val) models.add(val)
            }
          }
        } catch {}
      }
      if (process.env.AIDER_MODEL) models.add(process.env.AIDER_MODEL.trim())
      break
    }

    case 'copilot': {
      if (process.env.COPILOT_MODEL) models.add(process.env.COPILOT_MODEL.trim())
      break
    }
  }

  return Array.from(models)
}

export function discoverAllInstalledAgents(userConfig = {}) {
  const result = {}
  for (const agent of KNOWN_AGENTS) {
    const installed = isAgentInstalled(agent.id)
    if (installed) {
      result[agent.id] = {
        installed: true,
        availableModels: discoverHostModels(agent.id, userConfig),
      }
    }
  }
  return result
}

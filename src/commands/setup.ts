import { existsSync, mkdirSync, writeFileSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { homedir } from 'node:os'
import chalk from 'chalk'
import yaml from 'js-yaml'
import { createInterface } from 'node:readline'
import { discoverAgents }   from '../discovery/agents.js'
import { isDelegateAvailable, loadDelegateFleet } from '../discovery/delegate.js'
import type { UserConfig } from '../types/index.js'

// ─── Config path ──────────────────────────────────────────────────────────────

const CONFIG_DIR  = join(homedir(), '.adaptive-orchestrator')
const CONFIG_PATH = join(CONFIG_DIR, 'config.yaml')

// ─── Setup ────────────────────────────────────────────────────────────────────

export async function setup(): Promise<void> {
  console.log(chalk.bold('\n  Adaptive Orchestrator — Setup\n'))
  console.log('  Discovering environment...\n')

  // ── 1. Discover agents ───────────────────────────────────────────────────
  const agents = discoverAgents()
  const available = agents.filter((a) => a.available)

  console.log('  Agents:')
  for (const a of agents) {
    const icon = a.authenticated ? chalk.green('✓') : a.available ? chalk.yellow('~') : chalk.red('✗')
    const note = a.authenticated ? 'authenticated' : a.available ? 'installed (not auth)' : 'not installed'
    console.log(`    ${icon} ${a.id.padEnd(14)} ${chalk.dim(note)}`)
  }

  // ── 2. Delegate fleet ────────────────────────────────────────────────────
  console.log('')
  const delegateReady = isDelegateAvailable()
  const lanes = delegateReady ? loadDelegateFleet() : []

  if (delegateReady) {
    console.log(`  ${chalk.green('✓')} delegate-skills fleet detected (${lanes.length} lane(s))`)
    for (const lane of lanes) {
      console.log(chalk.dim(`    ${lane.name} → ${lane.agent}${lane.model ? ' / ' + lane.model : ''}`))
    }
  } else {
    console.log(`  ${chalk.red('✗')} delegate-skills fleet not detected`)
    console.log(chalk.dim('    Run: npx skills add amElnagdy/delegate-skills to set up'))
  }

  // ── 3. Agent role preferences ────────────────────────────────────────────
  console.log('')
  console.log('  Default policies:')
  console.log(chalk.dim('    Budget:    balanced'))
  console.log(chalk.dim('    Delegate:  disabled (use --delegate to enable)'))
  console.log(chalk.dim('    Max:       disabled (use --allow-max to enable)'))

  // ── 4. Write config ──────────────────────────────────────────────────────
  const config: UserConfig = {
    defaultBudget: 'balanced',
  }

  mkdirSync(CONFIG_DIR, { recursive: true })
  writeFileSync(CONFIG_PATH, yaml.dump(config), 'utf8')

  console.log('')
  console.log(chalk.green('  Setup complete.'))
  console.log(chalk.dim(`  Config saved to: ${CONFIG_PATH}`))
  console.log('')
}

// ─── Config loader ────────────────────────────────────────────────────────────

export function loadUserConfig(): UserConfig {
  if (!existsSync(CONFIG_PATH)) return {}
  try {
    return (yaml.load(readFileSync(CONFIG_PATH, 'utf8')) as UserConfig) ?? {}
  } catch {
    return {}
  }
}

import chalk from 'chalk'
import { discoverAgents } from '../discovery/agents.js'
import { isDelegateAvailable, loadDelegateFleet } from '../discovery/delegate.js'

// ─── Refresh ──────────────────────────────────────────────────────────────────

export async function refresh(): Promise<void> {
  console.log(chalk.bold('\n  Adaptive Orchestrator — Refresh\n'))
  console.log('  Re-scanning environment...\n')

  const agents = discoverAgents()
  console.log('  Agents:')
  for (const a of agents) {
    const icon = a.authenticated ? chalk.green('✓') : a.available ? chalk.yellow('~') : chalk.red('✗')
    console.log(`    ${icon} ${a.id}`)
  }

  const delegateReady = isDelegateAvailable()
  const lanes = delegateReady ? loadDelegateFleet() : []

  console.log('')
  if (delegateReady) {
    console.log(`  ${chalk.green('✓')} delegate-skills (${lanes.length} lane(s))`)
  } else {
    console.log(`  ${chalk.red('✗')} delegate-skills not found`)
  }

  console.log('')
  console.log(chalk.green('  Refresh complete.\n'))
}

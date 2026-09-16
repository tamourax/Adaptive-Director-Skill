#!/usr/bin/env node

import { Command } from 'commander'
import { setup }   from './commands/setup.js'
import { refresh } from './commands/refresh.js'
import { run }     from './commands/run.js'
import { resume }  from './commands/resume.js'
import type { BudgetMode } from './types/index.js'

const VALID_BUDGETS: BudgetMode[] = ['conservative', 'balanced', 'quality']

const program = new Command()

program
  .name('adaptive-orchestrator')
  .description('Adaptive multi-agent execution layer for coding tasks')
  .version('0.1.0')

// ── setup ─────────────────────────────────────────────────────────────────────
program
  .command('setup')
  .description('Discover installed agents and write initial config')
  .action(async () => {
    await setup()
  })

// ── refresh ───────────────────────────────────────────────────────────────────
program
  .command('refresh')
  .description('Re-scan environment for installed agents and delegate fleet')
  .action(async () => {
    await refresh()
  })

// ── resume ────────────────────────────────────────────────────────────────────
program
  .command('resume [run-id]')
  .description('Resume an interrupted run (defaults to most recent)')
  .action(async (runId?: string) => {
    await resume(runId ?? 'last')
  })

// ── run (default) ─────────────────────────────────────────────────────────────
program
  .argument('<task>', 'The coding task to execute')
  .option(
    '--budget <mode>',
    'Reasoning budget: conservative | balanced | quality',
    (v) => {
      if (!VALID_BUDGETS.includes(v as BudgetMode)) {
        console.error(`Invalid budget: "${v}". Must be one of: ${VALID_BUDGETS.join(', ')}`)
        process.exit(2)
      }
      return v as BudgetMode
    },
    'balanced'
  )
  .option('--delegate',   'Allow external delegate executors')
  .option('--allow-max',  'Permit max reasoning effort (disabled by default)')
  .option('--dry-run',    'Show routing plan without executing')
  .action(async (task: string, opts) => {
    await run({
      task,
      budget:      opts.budget as BudgetMode,
      useDelegate: opts.delegate  ?? false,
      allowMax:    opts.allowMax  ?? false,
      dryRun:      opts.dryRun    ?? false,
    })
  })

program.parse()

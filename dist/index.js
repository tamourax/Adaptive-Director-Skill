#!/usr/bin/env node
import { Command } from 'commander';
import { setup } from './commands/setup.js';
import { refresh } from './commands/refresh.js';
import { run } from './commands/run.js';
import { resume } from './commands/resume.js';
const VALID_BUDGETS = ['conservative', 'balanced', 'quality'];
const program = new Command();
program
    .name('adaptive-orchestrator')
    .description('Adaptive multi-agent execution layer for coding tasks')
    .version('0.1.0');
// ── setup ─────────────────────────────────────────────────────────────────────
program
    .command('setup')
    .description('Discover installed agents and write initial config')
    .action(async () => {
    await setup();
});
// ── refresh ───────────────────────────────────────────────────────────────────
program
    .command('refresh')
    .description('Re-scan environment for installed agents and delegate fleet')
    .action(async () => {
    await refresh();
});
// ── resume ────────────────────────────────────────────────────────────────────
program
    .command('resume [run-id]')
    .description('Resume an interrupted run (defaults to most recent)')
    .action(async (runId) => {
    await resume(runId ?? 'last');
});
// ── run (default) ─────────────────────────────────────────────────────────────
program
    .argument('<task>', 'The coding task to execute')
    .option('--budget <mode>', 'Reasoning budget: conservative | balanced | quality', (v) => {
    if (!VALID_BUDGETS.includes(v)) {
        console.error(`Invalid budget: "${v}". Must be one of: ${VALID_BUDGETS.join(', ')}`);
        process.exit(2);
    }
    return v;
}, 'balanced')
    .option('--delegate', 'Allow external delegate executors')
    .option('--allow-max', 'Permit max reasoning effort (disabled by default)')
    .option('--dry-run', 'Show routing plan without executing')
    .action(async (task, opts) => {
    await run({
        task,
        budget: opts.budget,
        useDelegate: opts.delegate ?? false,
        allowMax: opts.allowMax ?? false,
        dryRun: opts.dryRun ?? false,
    });
});
program.parse();
//# sourceMappingURL=index.js.map
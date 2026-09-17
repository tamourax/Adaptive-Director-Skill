#!/usr/bin/env node
import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { homedir } from 'node:os';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));

const args = process.argv.slice(2);
const subcmd = args[0] || 'help';

function run(script, scriptArgs = []) {
  try {
    const out = execFileSync(process.execPath, [script, ...scriptArgs], {
      encoding: 'utf8',
      timeout: 15000,
      cwd: process.cwd(),
      env: process.env,
    });
    return JSON.parse(out.trim());
  } catch {
    return null;
  }
}

if (subcmd === 'help' || subcmd === '--help' || subcmd === '-h') {
  console.log(`Adaptive Director — Delegate Skills Management

Usage:
  adaptive-director delegate <subcommand> [options]

Subcommands:
  install   Install delegate-skills via official installer and update config
  status    Display delegate-skills discovery, detected relays, and lanes
  help      Show this help message

Examples:
  adaptive-director delegate install
  adaptive-director delegate status
`);
  process.exit(0);
}

if (subcmd === 'install') {
  const setupScript = join(__dirname, 'setup.mjs');
  const forwardArgs = [setupScript, '--with-delegate', '--delegate-only', ...args.slice(1)];
  const res = spawnSync(process.execPath, forwardArgs, {
    stdio: 'inherit',
    env: process.env,
  });
  process.exit(res.status ?? 0);
}

if (subcmd === 'status') {
  console.log('\nAdaptive Director — Delegate Integration Status\n');

  const configPath = join(homedir(), '.adaptive-director', 'config.json');
  let config = {};
  if (existsSync(configPath)) {
    try {
      config = JSON.parse(readFileSync(configPath, 'utf8'));
    } catch {}
  }

  const discovery = run(join(__dirname, 'discover.mjs'));
  const ds = discovery?.delegateSkills ?? { installed: false, relays: [], lanes: {} };

  console.log(`  Installed:           ${ds.installed ? 'Yes' : 'No'}`);
  console.log(`  Config execution:    ${config.execution || 'native'}`);
  console.log(`  Config enabled:      ${config.delegate?.enabled ?? config.delegateEnabled ?? false}`);
  if (config.delegate?.lastInstallAttempt) {
    console.log(`  Last install attempt: ${config.delegate.lastInstallAttempt}`);
  }

  const skills = ds.skills ?? ds.relays ?? [];
  const relays = ds.relays ?? [];
  console.log(`\n  Detected Delegate Skills (${skills.length}):`);
  if (skills.length > 0) {
    for (const s of skills) {
      const isRelay = relays.includes(s);
      console.log(`    - ${s}${isRelay ? ' (execution relay)' : ''}`);
    }
  } else {
    console.log('    (none detected)');
  }

  const lanes = ds.lanes ?? {};
  const laneKeys = Object.keys(lanes);
  console.log(`\n  Active Execution Lanes (${laneKeys.length}):`);
  if (laneKeys.length > 0) {
    for (const k of laneKeys) {
      const lane = lanes[k];
      console.log(`    - ${k}: agent=${lane.agent || lane.implementer || 'unknown'}${lane.model ? `, model=${lane.model}` : ''}`);
    }
  } else {
    console.log('    (none configured)');
  }

  console.log('');
  process.exit(0);
}

console.error(`Unknown delegate subcommand: ${subcmd}`);
console.log(`Run 'adaptive-director delegate help' for usage.`);
process.exit(1);

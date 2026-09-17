#!/usr/bin/env node

import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import fs from 'node:fs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const args = process.argv.slice(2);
const command = args[0] || 'help';

const commands = {
  run: 'run.mjs',
  setup: 'setup.mjs',
  install: 'install.mjs',
  refresh: 'refresh.mjs',
  doctor: 'doctor.mjs',
  delegate: 'delegate-cli.mjs',
};

if (command === 'help' || command === '--help' || command === '-h') {
  console.log(`Adaptive Director Skill CLI v1.1.1

Usage:
  adaptive-director <command> [options]

Commands:
  run       - Run a complete Adaptive Director workflow for one coding task
  setup     - Initial interactive setup and host/delegate configuration
              Flags: --with-delegate, --no-delegate, --yes
  install   - Install/copy the Skill into supported host skill directories
  refresh   - Re-run discovery and update config without destroying user overrides
  doctor    - Validate installation and report health
  delegate  - Manage delegate-skills integration (install, status)
  help      - Show this help message
`);
  process.exit(0);
}

const targetScript = commands[command];

if (!targetScript) {
  console.error(`Unknown command: ${command}`);
  console.log(`Run 'adaptive-director help' for usage.`);
  process.exit(1);
}

const scriptPath = path.join(__dirname, targetScript);

if (!fs.existsSync(scriptPath)) {
  console.error(`Command not yet implemented: ${command}`);
  process.exit(1);
}

const result = spawnSync('node', [scriptPath, ...args.slice(1)], {
  stdio: 'inherit'
});

process.exit(result.status ?? 1);

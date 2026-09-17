#!/usr/bin/env node
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { homedir } from 'node:os';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));

function run(script, args = []) {
  try {
    const out = execFileSync(process.execPath, [script, ...args], {
      encoding: 'utf8', timeout: 15000,
      cwd: process.cwd(),
    });
    return JSON.parse(out.trim());
  } catch (e) {
    return null;
  }
}

const configDir = join(homedir(), '.adaptive-director');
const configPath = join(configDir, 'config.json');

console.log('Refreshing Adaptive Director config...\n');

const discovery = run(join(__dirname, 'discover.mjs'));
if (!discovery) {
  console.error('✗ Discovery failed.');
  process.exit(1);
}

let existingConfig = {};
if (existsSync(configPath)) {
  try {
    existingConfig = JSON.parse(readFileSync(configPath, 'utf8'));
  } catch {
    console.warn('! Existing config is invalid, creating a new one.');
  }
}

const config = {
  version: 1,
  defaultBudget: existingConfig.defaultBudget || 'balanced',
  allowMax: existingConfig.allowMax || false,
  delegateEnabled: existingConfig.delegateEnabled || false,
  hosts: {},
  overrides: existingConfig.overrides || {}
};

for (const [id, info] of Object.entries(discovery.agents ?? {})) {
  if (info.installed) {
    config.hosts[id] = {
      enabled: existingConfig.hosts?.[id]?.enabled ?? true,
      skillPath: info.skillPath
    };
  }
}

writeFileSync(configPath, JSON.stringify(config, null, 2), 'utf8');

console.log(`✓ Config updated successfully.`);

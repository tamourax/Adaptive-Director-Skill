#!/usr/bin/env node
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
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
  } catch {
    return null;
  }
}

function check(label, condition, fix = null) {
  if (condition) {
    console.log(`✓ ${label}`);
    return true;
  } else {
    console.log(`✗ ${label}`);
    if (fix) console.log(`  Fix: ${fix}`);
    return false;
  }
}

function warn(label) {
  console.log(`! ${label}`);
}

const configDir = join(homedir(), '.adaptive-director');
const configPath = join(configDir, 'config.json');
const pkgRoot = join(__dirname, '..');

console.log('Adaptive Director Doctor\n');

let allGood = true;

// ── Package files ──────────────────────────────────────────────────────────
allGood &= check('Package installed',     existsSync(join(pkgRoot, 'package.json')));
allGood &= check('SKILL.md exists',       existsSync(join(pkgRoot, 'SKILL.md')));
allGood &= check('references/ exists',    existsSync(join(pkgRoot, 'references')));

// ── Registry ──────────────────────────────────────────────────────────────
const registryPath = join(pkgRoot, 'data', 'registry.json');
if (check('Registry exists', existsSync(registryPath))) {
  try {
    JSON.parse(readFileSync(registryPath, 'utf8'));
    check('Registry valid', true);
  } catch {
    allGood &= check('Registry valid', false, 'Reinstall package');
  }
} else {
  allGood = false;
}

// ── Config ────────────────────────────────────────────────────────────────
if (check('Config exists', existsSync(configPath), 'adaptive-director setup')) {
  try {
    JSON.parse(readFileSync(configPath, 'utf8'));
    check('Config valid', true);
  } catch {
    allGood &= check('Config valid', false, 'rm ~/.adaptive-director/config.json && adaptive-director setup');
  }
} else {
  allGood = false;
}

// ── Routing script ────────────────────────────────────────────────────────
const routePath = join(__dirname, 'route.mjs');
if (existsSync(routePath)) {
  try {
    const testPayload = JSON.stringify({ taskSize: 'small', phase: 'implement', budget: 'balanced', allowMax: false, delegateEnabled: false });
    const out = execFileSync(process.execPath, [routePath, '--input', testPayload], {
      encoding: 'utf8', timeout: 8000
    });
    const result = JSON.parse(out.trim());
    const valid = result && result.agent && result.effort && result.execution;
    allGood &= check('Routing script works', valid, 'Check Node version or reinstall');
  } catch (e) {
    allGood &= check('Routing script works', false, `Error: ${e.message}`);
  }
} else {
  allGood &= check('Routing script works', false, 'Script missing — reinstall package');
}

// ── Run-state script ──────────────────────────────────────────────────────
allGood &= check('Run state script exists', existsSync(join(__dirname, 'run-state.mjs')));

// ── Host discovery ────────────────────────────────────────────────────────
console.log('');
const discovery = run(join(__dirname, 'discover.mjs'));
if (discovery) {
  let anyHost = false;
  for (const [id, info] of Object.entries(discovery.agents ?? {})) {
    if (!info.installed) continue;
    anyHost = true;
    check(`${id} detected`, true);
    if (info.hasSkill) {
      check(`Skill installed for ${id}`, true);
    } else if (info.skillPath) {
      allGood &= check(`Skill installed for ${id}`, false,
        `adaptive-director install ${info.skillPath}`);
    } else {
      warn(`Skill for ${id}: skill directory unknown (run setup after configuring host)`);
    }
  }
  if (!anyHost) warn('No supported hosts detected');

  console.log('');
  const ds = discovery.delegateSkills ?? { installed: false };
  if (ds.installed) {
    check(`delegate-skills detected (${Object.keys(ds.lanes ?? {}).length} lane(s))`, true);
  } else {
    warn('delegate-skills not detected (optional)');
  }
} else {
  allGood &= check('Discovery script works', false, 'Check Node version or reinstall');
}

console.log('');
if (allGood) {
  console.log('Ready.');
} else {
  console.log('Some checks failed. Run "adaptive-director setup" to fix.');
  process.exitCode = 1;
}

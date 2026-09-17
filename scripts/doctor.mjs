#!/usr/bin/env node
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { homedir } from 'node:os';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));

function run(script, args = [], env = process.env) {
  try {
    const out = execFileSync(process.execPath, [script, ...args], {
      encoding: 'utf8', timeout: 15000,
      cwd: process.cwd(),
      env,
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
const skillRoot = join(pkgRoot, 'skills', 'adaptive-director');

console.log('Adaptive Director Doctor\n');

let allGood = true;

// ── Package & Skill files ──────────────────────────────────────────────────
allGood &= check('Package installed',     existsSync(join(pkgRoot, 'package.json')));
allGood &= check('Skill source exists',   existsSync(skillRoot));
allGood &= check('SKILL.md exists',       existsSync(join(skillRoot, 'SKILL.md')));
allGood &= check('references/ exists',    existsSync(join(skillRoot, 'references')));
allGood &= check('templates/ exists',     existsSync(join(skillRoot, 'templates')));
allGood &= check('examples/ exists',      existsSync(join(skillRoot, 'examples')));

// ── Registry ──────────────────────────────────────────────────────────────
const registryPath = join(skillRoot, 'data', 'registry.json');
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
let configObj = null;
if (check('Config exists', existsSync(configPath), 'adaptive-director setup')) {
  try {
    configObj = JSON.parse(readFileSync(configPath, 'utf8'));
    check('Config valid', true);
  } catch {
    allGood &= check('Config valid', false, 'rm ~/.adaptive-director/config.json && adaptive-director setup');
  }
} else {
  allGood = false;
}

// ── Runtime Skill Scripts ─────────────────────────────────────────────────
const routePath = join(skillRoot, 'scripts', 'route.mjs');
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
  allGood &= check('Routing script works', false, 'Script missing in skills/adaptive-director/scripts — reinstall package');
}

allGood &= check('Run state script exists', existsSync(join(skillRoot, 'scripts', 'run-state.mjs')));
allGood &= check('Resume script exists',    existsSync(join(skillRoot, 'scripts', 'resume.mjs')));

// ── Host discovery ────────────────────────────────────────────────────────
console.log('');
const discovery = run(join(__dirname, 'discover.mjs'), [], process.env);
if (discovery) {
  let anyHost = false;
  for (const [id, info] of Object.entries(discovery.agents ?? {})) {
    if (!info.installed) continue;
    anyHost = true;
    check(`${id} detected`, true);
    const hostHasSkill = info.skillPath && (
      existsSync(join(info.skillPath, 'adaptive-director', 'SKILL.md')) ||
      existsSync(join(info.skillPath, 'Adaptive-Director', 'SKILL.md'))
    );
    if (hostHasSkill) {
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
  const ds = discovery.delegateSkills ?? { installed: false, skills: [], relays: [], lanes: {} };
  if (ds.installed) {
    const skillCount = (ds.skills ?? ds.relays ?? []).length;
    const laneCount = Object.keys(ds.lanes ?? {}).length;
    check(`delegate-skills detected (${skillCount} delegate skill(s), ${laneCount} lane(s))`, true);
  } else {
    warn('delegate-skills not detected (optional — native execution active)');
    if (configObj?.delegate?.lastInstallAttempt === 'failed') {
      warn('Last delegate-skills install attempt failed (run "adaptive-director delegate install" to retry)');
    } else if (configObj?.delegate?.lastInstallAttempt === 'unverified') {
      warn('delegate-skills installation unverified: no relays detected');
    }
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

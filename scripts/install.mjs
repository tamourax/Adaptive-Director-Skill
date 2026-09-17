#!/usr/bin/env node
import { execFileSync } from 'node:child_process';
import { mkdirSync, cpSync, rmSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const projectRoot = join(__dirname, '..');

const args = process.argv.slice(2);
const targets = args.filter(a => !a.startsWith('-'));

/**
 * Copy Adaptive Director Skill files into a host skill directory.
 * Idempotent: removes old copy first, then copies fresh.
 */
function installInto(hostSkillDir) {
  const dest = join(hostSkillDir, 'Adaptive-Director');
  console.log(`  Installing into ${dest}...`);
  if (existsSync(dest)) {
    rmSync(dest, { recursive: true, force: true });
  }
  mkdirSync(dest, { recursive: true });
  cpSync(join(projectRoot, 'SKILL.md'), join(dest, 'SKILL.md'));
  if (existsSync(join(projectRoot, 'references'))) {
    cpSync(join(projectRoot, 'references'), join(dest, 'references'), { recursive: true });
  }
  if (existsSync(join(projectRoot, 'templates'))) {
    cpSync(join(projectRoot, 'templates'), join(dest, 'templates'), { recursive: true });
  }
  if (existsSync(join(projectRoot, 'examples'))) {
    cpSync(join(projectRoot, 'examples'), join(dest, 'examples'), { recursive: true });
  }
  if (existsSync(join(projectRoot, 'data'))) {
    cpSync(join(projectRoot, 'data'), join(dest, 'data'), { recursive: true });
  }
  if (existsSync(join(projectRoot, 'scripts'))) {
    cpSync(join(projectRoot, 'scripts'), join(dest, 'scripts'), { recursive: true });
  }
  console.log(`  ✓ Installed successfully at ${dest}`);
}

// ─── If paths were passed as arguments, install into those directly ─────────
if (targets.length > 0) {
  for (const target of targets) {
    installInto(target);
  }
  process.exit(0);
}

// ─── No args: auto-discover hosts and install ───────────────────────────────
const discoverScript = join(__dirname, 'discover.mjs');

function runDiscover() {
  try {
    const out = execFileSync(process.execPath, [discoverScript], {
      encoding: 'utf8', timeout: 15000, cwd: process.cwd(),
    });
    return JSON.parse(out.trim());
  } catch {
    return null;
  }
}

console.log('\n  Adaptive Director — Install\n');
console.log('  Discovering hosts...\n');

const discovery = runDiscover();
if (!discovery) {
  console.error('  Error: discovery failed.');
  process.exit(1);
}

const hostsWithSkillDir = [];
for (const [id, info] of Object.entries(discovery.agents ?? {})) {
  if (info.installed && info.skillPath) {
    hostsWithSkillDir.push({ id, path: info.skillPath });
  } else if (info.installed) {
    console.log(`  ! ${id}: installed but skill directory could not be resolved. Skipping.`);
  }
}

if (hostsWithSkillDir.length === 0) {
  console.log('  No known host skill directories found. Nothing to install.');
  process.exit(0);
}

console.log('  Installing into detected hosts:');
for (const h of hostsWithSkillDir) {
  console.log(`  [→] ${h.id} — ${h.path}`);
}
console.log('');

for (const h of hostsWithSkillDir) {
  try {
    installInto(h.path);
  } catch (e) {
    console.error(`  ✗ Failed to install for ${h.id}: ${e.message}`);
  }
}

console.log('\n  Done. Run "adaptive-director doctor" to verify.\n');

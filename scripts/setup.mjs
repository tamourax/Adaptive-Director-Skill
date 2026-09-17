#!/usr/bin/env node
import { execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync, existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';
import { createInterface } from 'node:readline';

const CONFIG_DIR  = join(homedir(), '.adaptive-director');
const CONFIG_PATH = join(CONFIG_DIR, 'config.json');

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

function ask(rl, question) {
  return new Promise(resolve => rl.question(question, resolve));
}

async function main() {
  const nonInteractive = process.argv.includes('--yes');
  const scriptDir = new URL('.', import.meta.url).pathname.replace(/^\/([A-Z]:)/, '$1');
  const discoverScript = join(scriptDir, 'discover.mjs');
  const installScript = join(scriptDir, 'install.mjs');

  console.log('\n  Adaptive Director — Setup\n');
  console.log('  Discovering environment...\n');

  const discovery = run(discoverScript);
  if (!discovery) {
    console.error('  Error: discovery failed.');
    process.exit(1);
  }

  const hostsWithSkillDir = [];
  console.log('  Detected hosts:');
  
  let anyInstalled = false;
  for (const [id, info] of Object.entries(discovery.agents ?? {})) {
    if (!info.installed) continue;
    anyInstalled = true;
    const mark = '✓';
    console.log(`\n  ${mark} ${id}`);
    if (info.skillPath) {
      console.log(`    Skill directory: ${info.skillPath}`);
      hostsWithSkillDir.push({ id, path: info.skillPath });
    } else {
      console.log(`    Skill directory could not be resolved. Skipping automatic installation.`);
    }
  }

  if (!anyInstalled) {
      console.log('  None');
  }

  const rl = createInterface({ input: process.stdin, output: process.stdout });

  if (hostsWithSkillDir.length > 0) {
    console.log('\n  Install Adaptive Director into:');
    for (const h of hostsWithSkillDir) {
      console.log(`  [x] ${h.id}`);
    }
    
    if (!nonInteractive) {
      const ans = await ask(rl, '\n  Continue? [Y/n] ');
      if (ans.trim().toLowerCase() !== 'n') {
        const paths = hostsWithSkillDir.map(h => h.path);
        try {
          execFileSync(process.execPath, [installScript, ...paths], { stdio: 'inherit' });
        } catch(e) {
          console.error("  Installation failed");
        }
      } else {
        console.log('  Skipping installation.');
      }
    } else {
        const paths = hostsWithSkillDir.map(h => h.path);
        try {
          execFileSync(process.execPath, [installScript, ...paths], { stdio: 'inherit' });
        } catch(e) {
          console.error("  Installation failed");
        }
    }
  } else {
    console.log('\n  No known host skill directories found. Skipping automatic installation.');
  }

  console.log('');
  const ds = discovery.delegateSkills ?? { installed: false, lanes: {} };
  if (ds.installed) {
    console.log(`  ✓ delegate-skills fleet detected (${Object.keys(ds.lanes ?? {}).length} lane(s))`);
  } else {
    console.log('  delegate-skills not found.');
    console.log('\n  Adaptive Director works without it.');
    if (!nonInteractive) {
      const ans = await ask(rl, '\n  Install delegate support now? [y/N] ');
      if (ans.trim().toLowerCase() === 'y') {
        console.log('\n  Run:  npx skills add amElnagdy/delegate-skills');
        console.log('  Then re-run setup.\n');
        process.exit(0);
      }
    }
  }
  rl.close();

  // Create JSON config
  mkdirSync(CONFIG_DIR, { recursive: true });
  let existingConfig = {};
  if (existsSync(CONFIG_PATH)) {
    try {
      existingConfig = JSON.parse(readFileSync(CONFIG_PATH, 'utf8'));
    } catch {}
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
        enabled: true,
        skillPath: info.skillPath
      };
    }
  }

  writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2), 'utf8');

  console.log('\n  Config written to:', CONFIG_PATH);
  console.log('  Setup complete. Run "adaptive-director doctor" to verify.\n');
}

main().catch(err => {
  console.error('Setup error:', err.message);
  process.exit(1);
});

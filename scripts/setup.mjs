#!/usr/bin/env node
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdirSync, writeFileSync, existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';
import { createInterface } from 'node:readline';

const CONFIG_DIR  = join(homedir(), '.adaptive-director');
const CONFIG_PATH = join(CONFIG_DIR, 'config.json');

function run(script, args = [], env = process.env) {
  try {
    const out = execFileSync(process.execPath, [script, ...args], {
      encoding: 'utf8', timeout: 15000,
      cwd: process.cwd(),
      env,
    });
    return JSON.parse(out.trim());
  } catch (e) {
    return null;
  }
}

function ask(rl, question) {
  return new Promise(resolve => rl.question(question, resolve));
}

export function invokeOfficialDelegateInstaller(env = process.env) {
  const customCmd = env.DELEGATE_INSTALL_CMD || process.env.DELEGATE_INSTALL_CMD;
  const isWin = process.platform === 'win32';

  if (customCmd) {
    const parts = customCmd.trim().split(/\s+/);
    const bin = parts[0] === 'node' ? process.execPath : parts[0];
    const args = parts.slice(1);
    return spawnSync(bin, args, {
      stdio: (env.DELEGATE_INSTALL_VERBOSE || process.env.DELEGATE_INSTALL_VERBOSE) ? 'inherit' : 'pipe',
      encoding: 'utf8',
      env,
      shell: false,
    });
  }

  // Official command: npx skills add amElnagdy/delegate-skills
  const npxBin = isWin ? 'npx.cmd' : 'npx';
  return spawnSync(npxBin, ['skills', 'add', 'amElnagdy/delegate-skills'], {
    stdio: 'inherit',
    encoding: 'utf8',
    env,
    shell: false,
  });
}

function inspectDelegateSetup(relays = []) {
  if (!Array.isArray(relays) || !relays.includes('delegate-setup')) return null;
  const candidateDirs = [
    join(homedir(), '.agents', 'skills', 'delegate-setup', 'scripts', 'discover.mjs'),
    join(homedir(), '.codex', 'skills', 'delegate-setup', 'scripts', 'discover.mjs'),
    join(process.cwd(), 'delegate-skills', 'skills', 'delegate-setup', 'scripts', 'discover.mjs'),
  ];
  for (const p of candidateDirs) {
    if (existsSync(p)) {
      try {
        const out = execFileSync(process.execPath, [p], {
          encoding: 'utf8',
          timeout: 10000,
          env: process.env,
          stdio: ['ignore', 'pipe', 'ignore'],
        });
        return JSON.parse(out.trim());
      } catch {}
    }
  }
  return null;
}

async function main() {
  const args = process.argv.slice(2);
  const withDelegate = args.includes('--with-delegate');
  const noDelegate = args.includes('--no-delegate');
  const delegateOnly = args.includes('--delegate-only');
  const isCI = Boolean(process.env.CI || process.env.CONTINUOUS_INTEGRATION);
  const nonInteractive = args.includes('--yes') || args.includes('-y') || isCI || (!process.stdin.isTTY && !process.env.TEST_INTERACTIVE);

  const scriptDir = new URL('.', import.meta.url).pathname.replace(/^\/([A-Z]:)/, '$1');
  const discoverScript = join(scriptDir, 'discover.mjs');
  const installScript = join(scriptDir, 'install.mjs');

  console.log('\n  Adaptive Director — Setup\n');
  console.log('  Discovering environment...\n');

  const discovery = run(discoverScript, [], process.env);
  if (!discovery) {
    console.error('  Error: discovery failed.');
    process.exit(1);
  }

  const hostsWithSkillDir = [];
  if (!delegateOnly) {
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
  }

  const rl = createInterface({ input: process.stdin, output: process.stdout });

  if (!delegateOnly && hostsWithSkillDir.length > 0) {
    console.log('\n  Install Adaptive Director into:');
    for (const h of hostsWithSkillDir) {
      console.log(`  [x] ${h.id}`);
    }
    
    if (!nonInteractive) {
      const ans = await ask(rl, '\n  Continue? [Y/n] ');
      if (ans.trim().toLowerCase() !== 'n') {
        const paths = hostsWithSkillDir.map(h => h.path);
        try {
          execFileSync(process.execPath, [installScript, ...paths], { stdio: 'inherit', env: process.env });
        } catch(e) {
          console.error("  Installation failed");
        }
      } else {
        console.log('  Skipping installation.');
      }
    } else {
      const paths = hostsWithSkillDir.map(h => h.path);
      try {
        execFileSync(process.execPath, [installScript, ...paths], { stdio: 'inherit', env: process.env });
      } catch(e) {
        console.error("  Installation failed");
      }
    }
  } else if (!delegateOnly) {
    console.log('\n  No known host skill directories found. Skipping automatic installation.');
  }

  console.log('');

  // ── Delegate Skills Setup Flow ──────────────────────────────────────────
  let existingConfig = {};
  if (existsSync(CONFIG_PATH)) {
    try {
      existingConfig = JSON.parse(readFileSync(CONFIG_PATH, 'utf8'));
    } catch {}
  }

  let delegateStatus = {
    installed: false,
    enabled: false,
    lastInstallAttempt: null,
  };

  const initialDelegate = discovery.delegateSkills ?? { installed: false, lanes: {}, relays: [] };

  if (initialDelegate.installed) {
    console.log('  Delegate skills: detected');
    const detectedSkills = initialDelegate.skills ?? initialDelegate.relays ?? [];
    if (detectedSkills.length > 0) {
      console.log('  Detected delegate skills:');
      for (const s of detectedSkills) {
        console.log(`  - ${s}`);
      }
    }
    console.log('  Continue using existing installation.\n');
    delegateStatus.installed = true;
    delegateStatus.enabled = existingConfig.delegate?.enabled ?? existingConfig.delegateEnabled ?? false;
  } else {
    console.log('  Delegate skills: not detected\n');
    console.log('  Adaptive Director can optionally integrate with delegate-skills');
    console.log('  for headless execution across supported coding agents.\n');
    console.log('  Repository:');
    console.log('  https://github.com/amElnagdy/delegate-skills\n');

    let shouldInstall = false;

    if (noDelegate) {
      console.log('  Skipping delegate-skills installation (--no-delegate).');
      console.log('  Continuing with native execution.\n');
      shouldInstall = false;
    } else if (withDelegate) {
      shouldInstall = true;
    } else if (nonInteractive) {
      console.log('  Non-interactive environment: skipping optional delegate-skills installation.');
      console.log('  Continuing with native execution.\n');
      shouldInstall = false;
    } else {
      console.log('  Install delegate-skills now?');
      console.log('  [Y] Install');
      console.log('  [N] Continue with native execution');
      const ans = await ask(rl, '  Choice [y/N]: ');
      if (ans.trim().toLowerCase() === 'y') {
        shouldInstall = true;
      } else {
        console.log('  Skipping delegate-skills installation.');
        console.log('  Continuing with native execution.\n');
        shouldInstall = false;
      }
    }

    if (shouldInstall) {
      console.log('  Installing delegate-skills via official installer...');
      console.log('  Command: npx skills add amElnagdy/delegate-skills\n');

      const installResult = invokeOfficialDelegateInstaller();
      const exitCode = installResult.status ?? (installResult.error ? 1 : 0);

      if (exitCode !== 0) {
        const errorReason = installResult.error?.message || (installResult.stderr ? installResult.stderr.trim() : `Exit code ${exitCode}`);
        console.log('  Delegate installation failed.\n');
        console.log('  Command:');
        console.log('  npx skills add amElnagdy/delegate-skills\n');
        console.log('  Reason:');
        console.log(`  ${errorReason}\n`);
        console.log('  Adaptive Director will continue with native execution.\n');
        delegateStatus.installed = false;
        delegateStatus.enabled = false;
        delegateStatus.lastInstallAttempt = 'failed';
      } else {
        // Re-run discovery after installation
        const postDiscovery = run(discoverScript, [], process.env);
        const postDelegate = postDiscovery?.delegateSkills ?? { installed: false, relays: [] };

        if (!postDelegate.installed || !postDelegate.relays || postDelegate.relays.length === 0) {
          console.log('  Warning: delegate-skills installer completed, but delegate skills were not detected.');
          console.log('  Adaptive Director will continue with native execution.\n');
          delegateStatus.installed = false;
          delegateStatus.enabled = false;
          delegateStatus.lastInstallAttempt = 'unverified';
        } else {
          console.log('  Delegate skills installed successfully.\n');
          const postSkills = postDelegate.skills ?? postDelegate.relays ?? [];
          console.log('  Detected delegate skills:');
          for (const s of postSkills) {
            console.log(`  - ${s}`);
          }
          console.log('\n  Delegate execution remains optional.');
          console.log('  Native execution remains the default.\n');

          delegateStatus.installed = true;
          delegateStatus.enabled = false;
          delegateStatus.lastInstallAttempt = null;

          // Check if delegate-setup is available
          inspectDelegateSetup(postDelegate.relays);
        }
      }
    } else {
      delegateStatus.installed = false;
      delegateStatus.enabled = false;
    }
  }

  rl.close();

  const configDir = join(homedir(), '.adaptive-director');
  const configPath = join(configDir, 'config.json');

  mkdirSync(configDir, { recursive: true });

  const lastInstallAttempt = delegateStatus.lastInstallAttempt
    ? delegateStatus.lastInstallAttempt
    : (!delegateStatus.installed ? existingConfig.delegate?.lastInstallAttempt : undefined);

  const config = {
    version: 1,
    execution: existingConfig.execution || 'native',
    defaultBudget: existingConfig.defaultBudget || 'balanced',
    allowMax: existingConfig.allowMax || false,
    delegateEnabled: delegateStatus.enabled,
    delegate: {
      installed: delegateStatus.installed,
      enabled: delegateStatus.enabled,
      ...(lastInstallAttempt ? { lastInstallAttempt } : {})
    },
    hosts: {},
    overrides: existingConfig.overrides || {}
  };

  for (const [id, info] of Object.entries(discovery.agents ?? {})) {
    if (info.installed) {
      config.hosts[id] = {
        ...existingConfig.hosts?.[id],
        enabled: existingConfig.hosts?.[id]?.enabled ?? true,
        skillPath: info.skillPath
      };
    }
  }

  writeFileSync(configPath, JSON.stringify(config, null, 2), 'utf8');

  let doctorReady = false;
  try {
    const doctorOut = execFileSync(process.execPath, [join(scriptDir, 'doctor.mjs')], {
      encoding: 'utf8',
      timeout: 15000,
      env: process.env,
      stdio: ['ignore', 'pipe', 'ignore'],
    });
    doctorReady = doctorOut.includes('Ready.');
  } catch {}

  console.log('Adaptive Director is ready.\n');

  console.log('Installed hosts:');
  const installedHosts = Object.keys(config.hosts);
  if (installedHosts.length > 0) {
    for (const host of installedHosts) console.log(`✓ ${host}`);
  } else {
    console.log('! None detected');
  }

  console.log('\nDelegate integration:');
  if (delegateStatus.installed) {
    const relays = initialDelegate.relays ?? initialDelegate.skills ?? [];
    console.log('✓ Installed');
    console.log(`✓ ${relays.length} execution lane(s) detected`);
  } else {
    console.log('! Not installed (optional)');
    console.log('Native execution remains available.');
  }

  console.log('\nConfiguration:');
  console.log('✓ Created');
  console.log(`  ${configPath}`);

  console.log('\nHealth check:');
  console.log(doctorReady ? '✓ Ready' : '! Run adaptive-director doctor for details');

  console.log('\nTry:');
  console.log('  adaptive-director run "Add input validation to the login flow"\n');
}

main().catch(err => {
  console.error('Setup error:', err.message);
  process.exit(1);
});

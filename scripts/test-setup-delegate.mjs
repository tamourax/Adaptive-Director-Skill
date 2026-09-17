import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, rmSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

const repoRoot = process.cwd();
const setupPath = join(repoRoot, 'scripts', 'setup.mjs');
const doctorPath = join(repoRoot, 'scripts', 'doctor.mjs');
const refreshPath = join(repoRoot, 'scripts', 'refresh.mjs');
const cliPath = join(repoRoot, 'scripts', 'cli.mjs');

console.log('\n=== Delegate Setup UX & Resilience Tests ===\n');

function createIsolatedEnv(label) {
  const mockHome = join(tmpdir(), `ad-test-${label}-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  mkdirSync(mockHome, { recursive: true });
  return {
    mockHome,
    env: {
      ...process.env,
      HOME: mockHome,
      USERPROFILE: mockHome,
      APPDATA: join(mockHome, 'AppData', 'Roaming'),
      LOCALAPPDATA: join(mockHome, 'AppData', 'Local'),
      CI: '',
      CONTINUOUS_INTEGRATION: '',
    },
    cleanup() {
      try {
        rmSync(mockHome, { recursive: true, force: true });
      } catch {}
    }
  };
}

function installMockDelegate(mockHome, relays = ['codex-delegate', 'agy-delegate']) {
  const agentsSkillsDir = join(mockHome, '.agents', 'skills');
  for (const r of relays) {
    const relayDir = join(agentsSkillsDir, r, 'scripts');
    mkdirSync(relayDir, { recursive: true });
    writeFileSync(join(relayDir, 'relay.mjs'), '// mock relay', 'utf8');
  }
  writeFileSync(join(mockHome, '.agents', '.skill-lock.json'), JSON.stringify({ skills: { 'amElnagdy/delegate-skills': true } }), 'utf8');
}

// ── Test 1: Delegate already installed -> reuse, no prompt, no reinstall ─────────
{
  const { mockHome, env, cleanup } = createIsolatedEnv('t1-installed');
  try {
    installMockDelegate(mockHome);
    const out = execFileSync(process.execPath, [setupPath, '--yes'], {
      cwd: mockHome,
      env: { ...env, CI: '1' },
      encoding: 'utf8',
      timeout: 10000,
    });
    assert.ok(out.includes('Delegate skills: detected'), 'Test 1: should detect delegate skills');
    assert.ok(out.includes('Continue using existing installation'), 'Test 1: should reuse existing installation');
    assert.ok(!out.includes('Install delegate-skills now?'), 'Test 1: should NOT prompt to install');
    
    const config = JSON.parse(readFileSync(join(mockHome, '.adaptive-director', 'config.json'), 'utf8'));
    assert.equal(config.delegate?.installed, true, 'Test 1: config.delegate.installed must be true');
    assert.equal(config.delegate?.enabled, false, 'Test 1: config.delegate.enabled must be false by default');
    assert.equal(config.execution, 'native', 'Test 1: execution must default to native');
    console.log('✓ Test 1: Delegate already installed -> reused, no prompt');
  } finally {
    cleanup();
  }
}

// ── Test 2: Delegate missing + user selects No -> setup succeeds, native execution ─
{
  const { mockHome, env, cleanup } = createIsolatedEnv('t2-user-no');
  try {
    const out = execFileSync(process.execPath, [setupPath, '--delegate-only'], {
      cwd: mockHome,
      env: { ...env, TEST_INTERACTIVE: '1' },
      input: 'n\n',
      encoding: 'utf8',
      timeout: 10000,
    });
    assert.ok(out.includes('Delegate skills: not detected'), 'Test 2: should report not detected');
    assert.ok(out.includes('Skipping delegate-skills installation'), 'Test 2: should log skip');
    assert.ok(out.includes('Continuing with native execution'), 'Test 2: should confirm native execution');

    const config = JSON.parse(readFileSync(join(mockHome, '.adaptive-director', 'config.json'), 'utf8'));
    assert.equal(config.delegate?.installed, false, 'Test 2: delegate.installed must be false');
    assert.equal(config.delegate?.enabled, false, 'Test 2: delegate.enabled must be false');
    assert.equal(config.execution, 'native', 'Test 2: execution must be native');
    console.log('✓ Test 2: Delegate missing + user selects No -> native execution active');
  } finally {
    cleanup();
  }
}

// ── Test 3: Delegate missing + user selects Yes -> official installer called ──────
{
  const { mockHome, env, cleanup } = createIsolatedEnv('t3-user-yes');
  try {
    const installerScript = join(mockHome, 'mock-installer.mjs');
    writeFileSync(installerScript, `
      import { mkdirSync, writeFileSync } from 'node:fs';
      import { join } from 'node:path';
      import { homedir } from 'node:os';
      const dir = join(homedir(), '.agents', 'skills', 'codex-delegate', 'scripts');
      mkdirSync(dir, { recursive: true });
      writeFileSync(join(dir, 'relay.mjs'), '// installed', 'utf8');
      process.exit(0);
    `, 'utf8');

    const out = execFileSync(process.execPath, [setupPath, '--delegate-only'], {
      cwd: mockHome,
      env: {
        ...env,
        TEST_INTERACTIVE: '1',
        DELEGATE_INSTALL_CMD: `node ${installerScript}`,
      },
      input: 'y\n',
      encoding: 'utf8',
      timeout: 10000,
    });
    assert.ok(out.includes('Installing delegate-skills via official installer'), 'Test 3: should run installer');
    assert.ok(out.includes('Delegate skills installed successfully'), 'Test 3: should report success');
    assert.ok(out.includes('codex-delegate'), 'Test 3: should list discovered relay');

    const config = JSON.parse(readFileSync(join(mockHome, '.adaptive-director', 'config.json'), 'utf8'));
    assert.equal(config.delegate?.installed, true, 'Test 3: delegate.installed must be true');
    assert.equal(config.delegate?.enabled, false, 'Test 3: delegate.enabled must remain false by default');
    assert.equal(config.execution, 'native', 'Test 3: execution must remain native');
    console.log('✓ Test 3: Delegate missing + user selects Yes -> installed and verified');
  } finally {
    cleanup();
  }
}

// ── Test 4: setup --no-delegate -> no prompt, no install ─────────────────────────
{
  const { mockHome, env, cleanup } = createIsolatedEnv('t4-no-delegate');
  try {
    const out = execFileSync(process.execPath, [setupPath, '--no-delegate'], {
      cwd: mockHome,
      env: { ...env },
      encoding: 'utf8',
      timeout: 10000,
    });
    assert.ok(out.includes('--no-delegate'), 'Test 4: should note --no-delegate flag');
    assert.ok(!out.includes('Install delegate-skills now?'), 'Test 4: should NOT prompt');

    const config = JSON.parse(readFileSync(join(mockHome, '.adaptive-director', 'config.json'), 'utf8'));
    assert.equal(config.delegate?.installed, false, 'Test 4: installed must be false');
    assert.equal(config.execution, 'native', 'Test 4: execution must be native');
    console.log('✓ Test 4: setup --no-delegate -> bypasses prompt & install');
  } finally {
    cleanup();
  }
}

// ── Test 5: setup --with-delegate -> installs if missing, reuses if present ──────
{
  const { mockHome, env, cleanup } = createIsolatedEnv('t5-with-delegate');
  try {
    const installerScript = join(mockHome, 'mock-installer.mjs');
    writeFileSync(installerScript, `
      import { mkdirSync, writeFileSync } from 'node:fs';
      import { join } from 'node:path';
      import { homedir } from 'node:os';
      const dir = join(homedir(), '.agents', 'skills', 'agy-delegate', 'scripts');
      mkdirSync(dir, { recursive: true });
      writeFileSync(join(dir, 'relay.mjs'), '// installed', 'utf8');
      process.exit(0);
    `, 'utf8');

    // Step A: missing -> installs
    const out1 = execFileSync(process.execPath, [setupPath, '--with-delegate'], {
      cwd: mockHome,
      env: { ...env, DELEGATE_INSTALL_CMD: `node ${installerScript}` },
      encoding: 'utf8',
      timeout: 10000,
    });
    assert.ok(out1.includes('Delegate skills installed successfully'), 'Test 5A: installed missing delegate');

    // Step B: already present -> reuses
    const out2 = execFileSync(process.execPath, [setupPath, '--with-delegate'], {
      cwd: mockHome,
      env: { ...env, DELEGATE_INSTALL_CMD: `node ${installerScript}` },
      encoding: 'utf8',
      timeout: 10000,
    });
    assert.ok(out2.includes('Continue using existing installation'), 'Test 5B: reuses existing delegate');
    console.log('✓ Test 5: setup --with-delegate -> installs when missing, reuses when present');
  } finally {
    cleanup();
  }
}

// ── Test 6: Installer exits non-zero -> clear error, native continues, lastInstallAttempt: 'failed'
{
  const { mockHome, env, cleanup } = createIsolatedEnv('t6-fail');
  try {
    const failInstaller = join(mockHome, 'fail-installer.mjs');
    writeFileSync(failInstaller, "console.error('Network timeout during npx skills add'); process.exit(1);", 'utf8');

    const out = execFileSync(process.execPath, [setupPath, '--with-delegate'], {
      cwd: mockHome,
      env: { ...env, DELEGATE_INSTALL_CMD: `node ${failInstaller}` },
      encoding: 'utf8',
      timeout: 10000,
    });
    assert.ok(out.includes('Delegate installation failed'), 'Test 6: reports failure');
    assert.ok(out.includes('Adaptive Director will continue with native execution'), 'Test 6: continues native');

    const config = JSON.parse(readFileSync(join(mockHome, '.adaptive-director', 'config.json'), 'utf8'));
    assert.equal(config.delegate?.installed, false, 'Test 6: installed should be false');
    assert.equal(config.delegate?.lastInstallAttempt, 'failed', 'Test 6: lastInstallAttempt should be failed');
    assert.equal(config.execution, 'native', 'Test 6: execution must be native');
    console.log('✓ Test 6: Installer exits non-zero -> clear error, native execution preserved');
  } finally {
    cleanup();
  }
}

// ── Test 7: Installer exits 0 but delegate not discovered -> warning, lastInstallAttempt: 'unverified'
{
  const { mockHome, env, cleanup } = createIsolatedEnv('t7-unverified');
  try {
    const noopInstaller = join(mockHome, 'noop-installer.mjs');
    writeFileSync(noopInstaller, "process.exit(0);", 'utf8');

    const out = execFileSync(process.execPath, [setupPath, '--with-delegate'], {
      cwd: mockHome,
      env: { ...env, DELEGATE_INSTALL_CMD: `node ${noopInstaller}` },
      encoding: 'utf8',
      timeout: 10000,
    });
    assert.ok(out.includes('Warning: delegate-skills installer completed, but delegate skills were not detected'), 'Test 7: warns unverified');
    assert.ok(out.includes('Adaptive Director will continue with native execution'), 'Test 7: continues native');

    const config = JSON.parse(readFileSync(join(mockHome, '.adaptive-director', 'config.json'), 'utf8'));
    assert.equal(config.delegate?.installed, false, 'Test 7: installed should be false');
    assert.equal(config.delegate?.lastInstallAttempt, 'unverified', 'Test 7: lastInstallAttempt should be unverified');
    console.log('✓ Test 7: Installer exits 0 but unverified -> warning, lastInstallAttempt: unverified');
  } finally {
    cleanup();
  }
}

// ── Test 8: Repeated setup -> idempotent ──────────────────────────────────────────
{
  const { mockHome, env, cleanup } = createIsolatedEnv('t8-idempotent');
  try {
    installMockDelegate(mockHome);
    execFileSync(process.execPath, [setupPath, '--yes'], { cwd: mockHome, env: { ...env, CI: '1' }, encoding: 'utf8' });
    const cfg1 = readFileSync(join(mockHome, '.adaptive-director', 'config.json'), 'utf8');
    execFileSync(process.execPath, [setupPath, '--yes'], { cwd: mockHome, env: { ...env, CI: '1' }, encoding: 'utf8' });
    const cfg2 = readFileSync(join(mockHome, '.adaptive-director', 'config.json'), 'utf8');
    assert.equal(cfg1, cfg2, 'Test 8: repeated setup must be idempotent');
    console.log('✓ Test 8: Repeated setup -> idempotent output and config');
  } finally {
    cleanup();
  }
}

// ── Test 9: Doctor with delegate installed -> reports relays and PASS ─────────────
{
  const { mockHome, env, cleanup } = createIsolatedEnv('t9-doctor-installed');
  try {
    installMockDelegate(mockHome, ['codex-delegate', 'agy-delegate']);
    const cfgDir = join(mockHome, '.adaptive-director');
    mkdirSync(cfgDir, { recursive: true });
    writeFileSync(join(cfgDir, 'config.json'), JSON.stringify({ version: 1, execution: 'native', delegate: { installed: true, enabled: false } }), 'utf8');

    const out = execFileSync(process.execPath, [doctorPath], { cwd: mockHome, env, encoding: 'utf8' });
    assert.ok(out.includes('✓ delegate-skills detected (2 delegate skill(s)'), 'Test 9: doctor reports delegate skills count');
    assert.ok(out.includes('Ready.'), 'Test 9: doctor exits Ready');
    console.log('✓ Test 9: Doctor with delegate installed -> reports relay count & passes');
  } finally {
    cleanup();
  }
}

// ── Test 10: Doctor with delegate absent -> WARN only, not FAIL ───────────────────
{
  const { mockHome, env, cleanup } = createIsolatedEnv('t10-doctor-absent');
  try {
    const cfgDir = join(mockHome, '.adaptive-director');
    mkdirSync(cfgDir, { recursive: true });
    writeFileSync(join(cfgDir, 'config.json'), JSON.stringify({ version: 1, execution: 'native', delegate: { installed: false, enabled: false } }), 'utf8');

    const out = execFileSync(process.execPath, [doctorPath], { cwd: mockHome, env, encoding: 'utf8' });
    assert.ok(out.includes('! delegate-skills not detected (optional — native execution active)'), 'Test 10: doctor warns absent');
    assert.ok(out.includes('Ready.'), 'Test 10: doctor should still report Ready (not fail)');
    console.log('✓ Test 10: Doctor with delegate absent -> WARN only, exits Ready (PASS)');
  } finally {
    cleanup();
  }
}

// ── Test 11: CI / non-interactive mode -> skips prompt, no install unless flag ────
{
  const { mockHome, env, cleanup } = createIsolatedEnv('t11-ci');
  try {
    const out = execFileSync(process.execPath, [setupPath], {
      cwd: mockHome,
      env: { ...env, CI: 'true' },
      encoding: 'utf8',
      timeout: 10000,
    });
    assert.ok(out.includes('Non-interactive environment: skipping optional delegate-skills installation'), 'Test 11: detects CI and skips prompt');
    assert.ok(out.includes('Continuing with native execution'), 'Test 11: defaults to native in CI');
    console.log('✓ Test 11: CI / non-interactive mode -> skips prompt, defaults to native');
  } finally {
    cleanup();
  }
}

// ── Test 12: Existing user overrides preserved ────────────────────────────────────
{
  const { mockHome, env, cleanup } = createIsolatedEnv('t12-overrides');
  try {
    const cfgDir = join(mockHome, '.adaptive-director');
    mkdirSync(cfgDir, { recursive: true });
    const initialConfig = {
      version: 1,
      execution: 'native',
      defaultBudget: 'conservative',
      allowMax: true,
      delegateEnabled: false,
      delegate: { installed: false, enabled: false },
      hosts: {
        codex: { enabled: false, skillPath: '/custom/path', customField: 42 }
      },
      overrides: {
        customPolicy: 'strict'
      }
    };
    writeFileSync(join(cfgDir, 'config.json'), JSON.stringify(initialConfig, null, 2), 'utf8');

    // Run refresh
    execFileSync(process.execPath, [refreshPath], { cwd: mockHome, env, encoding: 'utf8' });
    const refreshed = JSON.parse(readFileSync(join(cfgDir, 'config.json'), 'utf8'));
    assert.equal(refreshed.defaultBudget, 'conservative', 'Test 12: defaultBudget preserved');
    assert.equal(refreshed.allowMax, true, 'Test 12: allowMax preserved');
    assert.equal(refreshed.overrides?.customPolicy, 'strict', 'Test 12: overrides preserved');
    assert.equal(refreshed.hosts?.codex?.customField, 42, 'Test 12: host custom field preserved');
    assert.equal(refreshed.hosts?.codex?.enabled, false, 'Test 12: host enabled status preserved');

    // Run setup --no-delegate
    execFileSync(process.execPath, [setupPath, '--no-delegate'], { cwd: mockHome, env, encoding: 'utf8' });
    const setupConfig = JSON.parse(readFileSync(join(cfgDir, 'config.json'), 'utf8'));
    assert.equal(setupConfig.defaultBudget, 'conservative', 'Test 12: defaultBudget preserved after setup');
    assert.equal(setupConfig.allowMax, true, 'Test 12: allowMax preserved after setup');
    assert.equal(setupConfig.overrides?.customPolicy, 'strict', 'Test 12: overrides preserved after setup');
    assert.equal(setupConfig.hosts?.codex?.customField, 42, 'Test 12: host custom field preserved after setup');
    assert.equal(setupConfig.hosts?.codex?.enabled, false, 'Test 12: host enabled status preserved after setup');
    console.log('✓ Test 12: Existing user overrides preserved across setup and refresh');
  } finally {
    cleanup();
  }
}

// ── Test 13: CLI subcommand 'delegate' (status & install) ─────────────────────────
{
  const { mockHome, env, cleanup } = createIsolatedEnv('t13-cli-delegate');
  try {
    installMockDelegate(mockHome, ['codex-delegate']);
    const statusOut = execFileSync(process.execPath, [cliPath, 'delegate', 'status'], {
      cwd: mockHome,
      env,
      encoding: 'utf8',
    });
    assert.ok(statusOut.includes('Delegate Integration Status'), 'Test 13: CLI delegate status output valid');
    assert.ok(statusOut.includes('codex-delegate'), 'Test 13: CLI delegate status lists relay');
    console.log('✓ Test 13: CLI delegate subcommand -> status works');
  } finally {
    cleanup();
  }
}

console.log('\n=== All 13 setup & delegate tests passed successfully! ✓ ===\n');

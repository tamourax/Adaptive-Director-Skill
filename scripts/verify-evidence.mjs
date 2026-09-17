#!/usr/bin/env node
import { existsSync, readFileSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import { join } from 'node:path'

export function detectVerificationCommands(cwd = process.cwd()) {
  const commands = []

  const packageJsonPath = join(cwd, 'package.json')
  if (existsSync(packageJsonPath)) {
    try {
      const pkg = JSON.parse(readFileSync(packageJsonPath, 'utf8'))
      if (pkg.scripts?.test) commands.push({ command: 'npm', args: ['test'], display: 'npm test' })
      if (pkg.scripts?.build) commands.push({ command: 'npm', args: ['run', 'build'], display: 'npm run build' })
    } catch {}
  }

  if (existsSync(join(cwd, 'pubspec.yaml'))) {
    commands.push({ command: 'flutter', args: ['analyze'], display: 'flutter analyze' })
    commands.push({ command: 'flutter', args: ['test'], display: 'flutter test' })
  }

  if (existsSync(join(cwd, 'artisan')) && existsSync(join(cwd, 'composer.json'))) {
    commands.push({ command: 'php', args: ['artisan', 'test'], display: 'php artisan test' })
  }

  const hasPythonProject =
    existsSync(join(cwd, 'pyproject.toml')) ||
    existsSync(join(cwd, 'pytest.ini')) ||
    existsSync(join(cwd, 'tox.ini')) ||
    existsSync(join(cwd, 'setup.cfg'))
  if (hasPythonProject) {
    commands.push({ command: 'pytest', args: [], display: 'pytest' })
  }

  return commands
}

export function runVerificationEvidence({ cwd = process.cwd(), timeoutMs = 120000, mockEvidence = null } = {}) {
  if (mockEvidence) {
    return {
      projectTypes: mockEvidence.projectTypes ?? ['mock'],
      commands: mockEvidence.commands ?? [],
      passed: Boolean(mockEvidence.passed),
      skipped: false,
      mocked: true,
    }
  }

  const detected = detectVerificationCommands(cwd)
  const results = []

  for (const cmd of detected) {
    const started = Date.now()
    const res = spawnSync(cmd.command, cmd.args, {
      cwd,
      encoding: 'utf8',
      timeout: timeoutMs,
      shell: false,
      stdio: ['ignore', 'pipe', 'pipe'],
    })
    const durationMs = Date.now() - started
    results.push({
      command: cmd.display,
      exitCode: res.status ?? (res.error ? 1 : 0),
      durationMs,
      stdout: (res.stdout ?? '').slice(-4000),
      stderr: (res.stderr ?? '').slice(-4000),
      timedOut: Boolean(res.error?.code === 'ETIMEDOUT'),
    })
  }

  return {
    projectTypes: inferProjectTypes(cwd),
    commands: results,
    passed: results.length > 0 && results.every(r => r.exitCode === 0),
    skipped: results.length === 0,
  }
}

function inferProjectTypes(cwd) {
  const types = []
  if (existsSync(join(cwd, 'package.json'))) types.push('node')
  if (existsSync(join(cwd, 'pubspec.yaml'))) types.push('flutter')
  if (existsSync(join(cwd, 'artisan')) && existsSync(join(cwd, 'composer.json'))) types.push('laravel')
  if (
    existsSync(join(cwd, 'pyproject.toml')) ||
    existsSync(join(cwd, 'pytest.ini')) ||
    existsSync(join(cwd, 'tox.ini')) ||
    existsSync(join(cwd, 'setup.cfg'))
  ) types.push('python')
  return types
}

if (process.argv[1]?.endsWith('verify-evidence.mjs')) {
  const result = runVerificationEvidence()
  process.stdout.write(JSON.stringify(result, null, 2) + '\n')
}

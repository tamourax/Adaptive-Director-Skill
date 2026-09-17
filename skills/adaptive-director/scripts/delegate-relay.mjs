#!/usr/bin/env node
/**
 * delegate-relay.mjs
 * ──────────────────
 * Production-hardened execution bridge between Adaptive Director and delegate-skills relays.
 * Implements execution boundaries, workspace mutation tracking, hung-process timeout guards,
 * and safe recovery vs native fallback semantics.
 *
 * Zero external dependencies (pure Node.js built-ins).
 */

import { execSync, spawnSync } from 'node:child_process'
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { findRelayScript } from './route.mjs'

/**
 * Capture git porcelain workspace state to detect mutations across relay runs.
 */
export function captureWorkspaceState(cwd = process.cwd()) {
  try {
    const status = execSync('git status --porcelain', {
      cwd,
      encoding: 'utf8',
      timeout: 5000,
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim()
    return { inGit: true, status }
  } catch {
    return { inGit: false, status: null }
  }
}

/**
 * Parse human duration string (e.g. '10s', '5m', '2h') into milliseconds.
 */
export function parseDurationMs(val, defaultMs = 600000) {
  if (!val) return defaultMs
  if (typeof val === 'number') return val
  const match = String(val).trim().match(/^(\d+)(s|m|h|d)?$/i)
  if (!match) return defaultMs
  const num = parseInt(match[1], 10)
  const unit = (match[2] || 'ms').toLowerCase()
  if (unit === 's') return num * 1000
  if (unit === 'm') return num * 60 * 1000
  if (unit === 'h') return num * 60 * 60 * 1000
  if (unit === 'd') return num * 24 * 60 * 60 * 1000
  return num
}

/**
 * Executes a delegate relay with strict execution boundary and workspace mutation detection.
 */
export function executeDelegateRelay(options = {}) {
  const {
    agent,
    briefPath,
    briefContent,
    cwd = process.cwd(),
    model = null,
    effort = null,
    readOnly = false,
    timeout = '10m',
    customRelayPath = null,
    outDir = null,
  } = options

  // ── Safe pre-execution check: Relay script exists ──
  const relayPath = customRelayPath ?? findRelayScript(agent)
  if (!relayPath || !existsSync(relayPath)) {
    return {
      ok: false,
      error: 'relay_not_found',
      agent,
      relayPath: relayPath ?? null,
      workspaceMutated: false,
      safeFallbackToNative: true,
      recoveryRequired: false,
      status: 'fallback_native',
      message: `Delegate relay script for agent '${agent}' was not found on disk. Safe to fall back to native.`,
    }
  }

  // Ensure brief exists
  let actualBriefPath = briefPath
  let tempBriefDir = null
  if (!actualBriefPath && briefContent) {
    tempBriefDir = join(tmpdir(), `ad-relay-brief-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`)
    mkdirSync(tempBriefDir, { recursive: true })
    actualBriefPath = join(tempBriefDir, 'brief.md')
    writeFileSync(actualBriefPath, briefContent, 'utf8')
  }

  if (!actualBriefPath || !existsSync(actualBriefPath)) {
    return {
      ok: false,
      error: 'brief_not_found',
      workspaceMutated: false,
      safeFallbackToNative: true,
      recoveryRequired: false,
      status: 'fallback_native',
      message: `Brief file '${actualBriefPath}' does not exist. Safe to fall back to native.`,
    }
  }

  // Setup artifacts directory
  const actualOutDir = outDir ?? join(tmpdir(), `ad-relay-out-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`)
  if (!existsSync(actualOutDir)) {
    mkdirSync(actualOutDir, { recursive: true })
  }

  // ── Execution Boundary: Capture workspace state BEFORE dispatch ──
  const preState = captureWorkspaceState(cwd)

  const args = [
    relayPath,
    '--brief', actualBriefPath,
    '--cd', cwd,
    '--out-dir', actualOutDir,
  ]
  if (model)    args.push('--model', model)
  if (effort)   args.push('--effort', effort)
  if (readOnly) args.push('--read-only')
  if (timeout)  args.push('--timeout', String(timeout))

  const timeoutMs = parseDurationMs(timeout, 600000)
  let spawnResult

  try {
    spawnResult = spawnSync(process.execPath, args, {
      encoding: 'utf8',
      timeout: timeoutMs,
      env: process.env,
    })
  } catch (err) {
    // Post-failure workspace check
    const postState = captureWorkspaceState(cwd)
    const workspaceMutated = preState.inGit && postState.inGit ? preState.status !== postState.status : false
    return {
      ok: false,
      error: 'relay_spawn_error',
      workspaceMutated,
      safeFallbackToNative: !workspaceMutated,
      recoveryRequired: workspaceMutated,
      status: workspaceMutated ? 'needs_recovery' : 'fallback_native',
      message: err.message,
    }
  }

  // ── Check for Hung Process / Timeout ──
  const isTimedOut = Boolean(
    spawnResult.error && (spawnResult.error.code === 'ETIMEDOUT' || spawnResult.signal === 'SIGTERM')
  )

  const exitCode = spawnResult.status ?? (isTimedOut ? 124 : (spawnResult.error ? 1 : 0))
  const resultJsonPath = join(actualOutDir, 'result.json')

  // Helper to resolve failure with workspace mutation boundary
  function resolveFailure(errorType, message, extra = {}) {
    const postState = captureWorkspaceState(cwd)
    const workspaceMutated = preState.inGit && postState.inGit ? preState.status !== postState.status : false
    const safeFallbackToNative = !workspaceMutated
    const recoveryRequired = workspaceMutated

    return {
      ok: false,
      error: errorType,
      exitCode,
      workspaceMutated,
      safeFallbackToNative,
      recoveryRequired,
      status: recoveryRequired ? 'needs_recovery' : 'fallback_native',
      stderr: spawnResult.stderr ?? '',
      stdout: spawnResult.stdout ?? '',
      message: recoveryRequired
        ? `${message} Workspace mutations detected. Automatic native fallback blocked to prevent duplicate/conflicting edits. Requires review/recovery.`
        : `${message} No workspace mutations detected. Safe to fall back to native.`,
      ...extra,
    }
  }

  if (isTimedOut) {
    return resolveFailure('relay_timeout', `Relay execution timed out after ${timeoutMs}ms and was terminated.`)
  }

  if (!existsSync(resultJsonPath)) {
    return resolveFailure('result_missing', `Relay exited with code ${exitCode} but did not write result.json.`)
  }

  let parsedResult = null
  try {
    const raw = readFileSync(resultJsonPath, 'utf8')
    parsedResult = JSON.parse(raw)
  } catch (err) {
    return resolveFailure(
      'result_malformed',
      `result.json is malformed or invalid JSON: ${err.message}`,
      { rawContent: readFileSync(resultJsonPath, 'utf8').slice(0, 500) }
    )
  }

  if (exitCode !== 0) {
    return resolveFailure(
      'relay_exit_nonzero',
      `Relay process exited with code ${exitCode}.`,
      { rawResult: parsedResult, finalMessage: parsedResult?.finalMessage ?? '' }
    )
  }

  if (parsedResult.status !== 'completed') {
    return resolveFailure(
      'relay_status_unsuccessful',
      `Relay finished with status: ${parsedResult.status}`,
      { rawResult: parsedResult, finalMessage: parsedResult?.finalMessage ?? '' }
    )
  }

  // ── Success ──
  const postState = captureWorkspaceState(cwd)
  const workspaceMutated = preState.inGit && postState.inGit ? preState.status !== postState.status : false

  return {
    ok: true,
    status: parsedResult.status,
    workspaceMutated,
    safeFallbackToNative: false, // Successful run, no fallback needed
    recoveryRequired: false,
    finalMessage: parsedResult.finalMessage ?? '',
    touchedFiles: parsedResult.touchedFiles ?? [],
    sessionId: parsedResult.sessionId ?? parsedResult.threadId ?? parsedResult.conversationId ?? null,
    outDir: actualOutDir,
    rawResult: parsedResult,
  }
}

export default executeDelegateRelay

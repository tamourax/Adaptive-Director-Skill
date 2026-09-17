# Adaptive Director Skill

[![npm version](https://img.shields.io/npm/v/adaptive-director-skill.svg)](https://www.npmjs.com/package/adaptive-director-skill)
[![Node.js](https://img.shields.io/badge/node-%3E%3D18.0.0-brightgreen.svg)](https://nodejs.org)
[![Zero Dependencies](https://img.shields.io/badge/dependencies-0%20pure%20built--ins-blue.svg)](#requirements)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

**One coding task. The right AI for every phase.**

Adaptive Director is a local, skill-first workflow director for AI coding agents. Give it one task and it coordinates the rest: planning, implementation, independent review, targeted fixing, and verification.

It is built for developers who already use tools like Codex, Claude Code, AGY, and delegate-skills, but do not want to manually decide which agent should plan, code, review, and verify every change.

```bash
npx adaptive-director-skill setup
adaptive-director run "Add refresh-token authentication"
```

## Why This Exists

One AI agent doing everything is convenient, but it creates predictable failure modes:

| Problem | What happens |
| --- | --- |
| Weak planning | A cheap or fast model makes the wrong architectural call. |
| Self-review | The same context that wrote the bug often misses it. |
| Overpowered simple tasks | Expensive reasoning gets spent on small edits. |
| Manual model juggling | You keep switching tools instead of shipping. |
| No proof | A final answer says "done" without test/build evidence. |

Adaptive Director turns that into a disciplined local loop.

## Workflow

This chart is plain text so it stays readable on npm, GitHub, terminals, and package mirrors.

```text
User task
  |
  v
Classify size: small / medium / large
  |
  v
Route each phase to the best available host + model + effort
  |
  v
+---------+      +------------+      +--------------------+      +----------+
|  Plan   | ---> | Implement  | ---> | Independent Review | ---> |  Verify  |
+---------+      +------------+      +--------------------+      +----------+
                                      |
                                      | critical findings only
                                      v
                                +------------+
                                |    Fix     |
                                +------------+
                                      |
                                      v
                                Re-review once
```

Terminal statuses are explicit:

| Status | Meaning |
| --- | --- |
| `completed` | Workflow finished and verification passed, or no supported deterministic gates were detected. |
| `blocked` | Critical review findings remain after the allowed fix cycle, or verification evidence failed. |
| `needs_recovery` | Delegate execution mutated the workspace and failed, so automatic fallback was blocked. |
| `failed` | A configuration or execution error prevented safe progress. |

## Install And Setup

Recommended one-command onboarding:

```bash
npx adaptive-director-skill setup
```

That command:

1. Detects supported coding-agent hosts.
2. Installs the Adaptive Director skill into host skill directories.
3. Creates or updates `~/.adaptive-director/config.json`.
4. Detects optional delegate-skills.
5. Runs health checks.
6. Prints the first command to try.

Global install:

```bash
npm install -g adaptive-director-skill
adaptive-director setup
```

Native-only non-interactive setup:

```bash
npx adaptive-director-skill setup --yes --no-delegate
```

Setup with delegate-skills integration:

```bash
npx adaptive-director-skill setup --with-delegate
```

## Run A Task

```bash
adaptive-director run "Add input validation to the login flow"
```

What happens:

1. A run workspace is created under `.adaptive-director/runs/<run-id>/`.
2. The task is classified.
3. Phase routing decisions are persisted.
4. Each phase receives a focused handoff brief.
5. Critical review findings trigger one targeted fix/re-review cycle.
6. Verification evidence is collected from real project commands where detected.
7. Final run status is persisted.

Example output shape:

```text
Adaptive Director
Run: run-a1b2c3d4

Task size: medium
Budget: balanced

[1/4] Plan
  Agent: agy
  Model: claude-sonnet-4-6
  Effort: high
  completed

[2/4] Implement
  Agent: codex
  Model: gpt-6-astra
  Effort: medium
  completed

[3/4] Review
  Agent: claude
  Anti-affinity: Tier 4
  0 critical
  2 warnings

[4/4] Verify
  npm test passed

Status: completed
```

## Command Reference

### Core commands

| Command | Purpose |
| --- | --- |
| `adaptive-director run "<task>"` | Run the complete workflow for one coding task. |
| `adaptive-director setup` | Discover hosts, install the skill, configure optional delegate integration. |
| `adaptive-director install` | Reinstall/update the skill into detected host skill directories. |
| `adaptive-director refresh` | Re-discover hosts and update config while preserving overrides. |
| `adaptive-director doctor` | Validate package, config, routing, hosts, and delegate integration. |
| `adaptive-director delegate install` | Install delegate-skills through its official installer. |
| `adaptive-director delegate status` | Show delegate detection, relays, and lanes. |
| `adaptive-director help` | Show CLI help. |

### `run` flags

| Flag | Values | Default | Meaning |
| --- | --- | --- | --- |
| `--budget <mode>` | `conservative`, `balanced`, `quality` | `balanced` | Chooses effort levels per phase. |
| `--delegate` | boolean | off | Allows delegate lanes when available. Native remains the fallback. |
| `--allow-max` | boolean | off | Allows `max` effort if routing selects it. Without this, `max` is downgraded. |
| `--dry-run` | boolean | off | Prints routing decisions without executing phases. |
| `--cwd <path>` | path | current directory | Runs the task against a specific project directory. |

Examples:

```bash
adaptive-director run "Fix password reset validation"
adaptive-director run "Refactor payment architecture" --budget quality
adaptive-director run "Add tests for billing retries" --delegate
adaptive-director run "Plan the auth migration" --dry-run
adaptive-director run "Fix API pagination" --cwd ../my-api
adaptive-director run "High-risk security refactor" --budget quality --allow-max
```

### `setup` flags

| Flag | Meaning |
| --- | --- |
| `--with-delegate` | Install delegate-skills through the official installer if missing. |
| `--no-delegate` | Skip optional delegate installation and keep native execution active. |
| `--yes`, `-y` | Non-interactive setup. |
| `--delegate-only` | Internal helper used by `adaptive-director delegate install`. |

Examples:

```bash
adaptive-director setup
adaptive-director setup --yes --no-delegate
adaptive-director setup --with-delegate
adaptive-director delegate status
```

## Phase Policy

Static phase maps stay simple:

| Task size | Static phases |
| --- | --- |
| small | `implement -> review` |
| medium | `plan -> implement -> review -> verify` |
| large | `plan -> implement -> review -> verify` |

`fix` is not part of the static map. It is inserted dynamically only when review finds critical issues.

```text
Review has 0 critical findings
  -> Verify

Review has critical findings
  -> Fix
  -> Re-review
  -> Verify if clean
  -> Blocked if critical findings remain
```

Warnings and suggestions are reported but do not trigger a fix cycle.

## Routing

Routing chooses:

- host/agent
- model
- reasoning effort
- native or delegate execution
- review anti-affinity
- verification capability

Routing priority:

```text
User overrides
  -> delegate fleet lanes, only when --delegate is passed
  -> dynamic host/model discovery
  -> capability registry
  -> safe fallback
```

Capability scores in `skills/adaptive-director/data/registry.json` are routing priors, not vendor benchmarks.

## Native And Delegate Execution

Adaptive Director is native-first. It must work without delegate-skills.

When `--delegate` is passed, delegate lanes may be used for matching phases. Delegate execution reuses the hardened `delegate-relay.mjs` boundary:

- relay missing -> safe native fallback
- non-zero relay exit -> inspect workspace mutation
- missing/malformed result -> fail safely
- timeout -> terminate and inspect workspace
- mutated workspace after failure -> `needs_recovery`, no automatic retry

Native execution is explicit. Adaptive Director does not pretend a host completed work when it cannot be invoked. If no automatic native executor is configured, a phase fails with `native_invocation_required`.

### Native executor contract

Set `AD_NATIVE_EXECUTOR` to a command that reads JSON from stdin and returns JSON on stdout.

Input shape:

```json
{
  "phase": "implement",
  "runId": "run-a1b2c3d4",
  "task": "Add input validation",
  "brief": "...",
  "briefPath": ".adaptive-director/runs/run-a1b2c3d4/brief-implement.md",
  "cwd": "/path/to/project",
  "agent": "codex",
  "model": "gpt-6-astra",
  "effort": "medium",
  "execution": "native",
  "route": {}
}
```

Output shape:

```json
{
  "ok": true,
  "status": "completed",
  "summary": "Changed lib/auth.ts and added validation tests.",
  "findings": [],
  "artifacts": [],
  "resultPath": ".adaptive-director/runs/run-a1b2c3d4/implement.json"
}
```

## Verification Evidence

Verification is not only an AI instruction. Adaptive Director detects common project types and runs conservative gates when available:

| Project | Detection | Commands |
| --- | --- | --- |
| Node.js | `package.json` | `npm test`, `npm run build` when scripts exist |
| Flutter | `pubspec.yaml` | `flutter analyze`, `flutter test` |
| Laravel/PHP | `artisan` + `composer.json` | `php artisan test` |
| Python | `pyproject.toml`, `pytest.ini`, `tox.ini`, or `setup.cfg` | `pytest` |

Evidence is stored in run metadata and `verification-evidence.json`:

```json
{
  "commands": [
    {
      "command": "npm test",
      "exitCode": 0,
      "durationMs": 1200
    }
  ],
  "passed": true
}
```

## Supported Hosts

Adaptive Director can discover these host CLIs when installed:

| Host | Binary |
| --- | --- |
| Claude Code | `claude` |
| Codex | `codex` |
| AGY / Antigravity | `agy` |
| Gemini | `gemini` |
| OpenCode | `opencode` |
| Aider | `aider` |
| Cursor Agent | `cursor-agent` |
| Cline | `cline` |
| GitHub Copilot CLI | `copilot` |

Delegate relays can add more implementers through `delegate-skills`.

## Skill Prompt Usage

The package also installs a normal agent skill. You can ask an agent directly:

```text
Use $adaptive-director to implement Stripe checkout in Flutter.
```

Useful prompt flags:

```text
Use $adaptive-director --budget quality to refactor the auth system.
Use $adaptive-director --delegate to implement the billing retry flow.
Use $adaptive-director --dry-run to show routing for this task.
Use $adaptive-director --allow-max for this high-risk migration.
```

## Configuration

User config lives at:

```text
~/.adaptive-director/config.json
```

Example:

```json
{
  "version": 1,
  "execution": "native",
  "defaultBudget": "balanced",
  "allowMax": false,
  "delegateEnabled": false,
  "hosts": {
    "codex": {
      "enabled": true,
      "skillPath": "C:/Users/you/.codex/skills"
    }
  },
  "overrides": {
    "plan": "claude",
    "implement": "codex",
    "review": "claude"
  }
}
```

## Requirements

- Node.js 18+
- Git for workspace mutation detection and touched-file reporting
- At least one supported coding-agent CLI for real execution
- Authenticated host CLIs for real model calls
- No runtime npm dependencies in Adaptive Director itself

## Validation Status

Verified locally:

- `npm test`
- setup and doctor flows
- routing decisions and persistence
- `implement.md` review handoff regression
- mock end-to-end happy path
- mock critical fix path
- blocked path after one fix cycle
- delegate mutation failure -> `needs_recovery`
- `npm pack --dry-run`

Real host validation depends on your local CLI authentication and quotas. Adaptive Director reports those failures plainly instead of claiming success.

## Upgrade

```bash
npm install -g adaptive-director-skill@latest
adaptive-director install
adaptive-director doctor
```

## Uninstall

```bash
npm uninstall -g adaptive-director-skill
```

`npm uninstall` removes the package, but it does not remove copied skill folders from host skill directories. Delete those manually if needed.

## License

MIT License © 2026 [Ahmed Tamer](https://github.com/tamourax). See [LICENSE](LICENSE) for details.

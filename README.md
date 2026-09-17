# Adaptive Director Skill

[![npm version](https://img.shields.io/npm/v/adaptive-director-skill.svg)](https://www.npmjs.com/package/adaptive-director-skill)
[![Node.js](https://img.shields.io/badge/node-%3E%3D18.0.0-brightgreen.svg)](https://nodejs.org)
[![Zero Dependencies](https://img.shields.io/badge/dependencies-0%20(pure%20built--ins)-blue.svg)](#core-principles)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

> **One task in. The right agents take it from there.**

**Adaptive Director Skill** is a lightweight, skill-first orchestration layer for AI coding agents. Give it a single development task, and it dynamically directs each phase—**Planning, Implementation, Review, Fixing, and Verification**—to the best available agent, model, and reasoning effort.

Instead of burning expensive reasoning tokens on simple edits or trusting a weak model with complex architecture and reviews, it directs work intelligently based on capability and budget.

```text
               User Task
                   ↓
         Adaptive Director
                   ↓
Plan  →  Implement  →  Review  →  Verify
 ↓           ↓            ↓
Best        Best     Independent
Agent       Coder     Reviewer
```

---

## Why Use It?

Running an entire task with a single agent often leads to three common problems:
- **Weak models on critical planning:** Lightweight models make architectural mistakes.
- **Wasted reasoning tokens:** Using maximum reasoning for minor code changes burns quota needlessly.
- **Review blind spots:** Agents struggle to catch their own errors during self-review.

### How It Solves This

```mermaid
flowchart LR
    Task([User Task]) --> Plan["1. Plan<br/>(High Reasoning)"]
    Plan --> Impl["2. Implement<br/>(Fast Coder)"]
    Impl --> Rev["3. Review<br/>(Independent Agent)"]
    Rev --> Gate{"Critical<br/>Issues?"}
    Gate -- Yes --> Fix["Targeted Fix<br/>(Max 1 Cycle)"]
    Fix --> Rev
    Gate -- No --> Ver["4. Verify<br/>(Automated Tests)"]
    Ver --> Done([Verified])
```

| Phase | Adaptive Decision |
|---|---|
| **Plan** | Directed to a strong reasoning model |
| **Implement** | Routed to an efficient coding specialist |
| **Review** | Checked by an independent reviewer (never self-reviewed) |
| **Fix** | Automated 1-cycle fix for critical findings |
| **Verify** | Validated via project test suites (`flutter test`, `npm test`, `pytest`) |

---

## Quick Start

Adaptive Director runs with **zero external npm dependencies** (pure Node.js built-ins).

### 1. Set Up

```bash
npx adaptive-director-skill setup
```

This downloads the package, detects supported coding-agent hosts, installs the Skill, creates local config, checks optional delegate-skills integration, and runs health validation.

For a global installation:

```bash
npm install -g adaptive-director-skill
adaptive-director setup
```

### 2. Run a Task

```bash
adaptive-director run "Add refresh-token authentication"
```

The `run` command creates a run workspace, classifies the task, routes every phase, persists routing decisions, dispatches execution, handles critical-only fix/re-review, records verification evidence, and finishes with a terminal status.

### 3. Verify Installation

```bash
adaptive-director doctor
```

Expected output:
```
✓ Package installed
✓ Skill source exists
✓ SKILL.md exists
✓ references/ exists
✓ templates/ exists
✓ examples/ exists
✓ Registry exists
✓ Registry valid
✓ Config exists
✓ Config valid
✓ Routing script works
✓ Run state script exists
✓ Resume script exists
✓ codex detected
✓ Skill installed for codex

Ready.
```

### 4. Skill Prompt Usage

The Skill is also installed in your agent's skills directory. You can still prompt your agent directly:

```text
Use $adaptive-director to implement Stripe checkout in Flutter
```

---

## Example Walkthrough

**Task:** `"Implement Stripe in Flutter"`

1. **Plan:** Claude (High Effort) inspects the repo and builds the execution plan.
2. **Implement:** Codex (Medium Effort) writes the code without committing.
3. **Review:** An independent Claude session inspects the diff.
   - *Finds 1 Critical issue:* PaymentIntent confirmed twice on retry.
4. **Fix:** Codex receives a targeted brief to fix only that critical bug.
5. **Re-Review:** Reviewer confirms the fix.
6. **Verify:** Runs `flutter analyze && flutter test`.
7. **Done:** Changes left uncommitted for final developer review.

---

## Repository Architecture

The repository separates the **npm management/installer layer** from the **self-contained Agent Skill**:

- **Repository Root:** npm distribution, CLI tools, setup, host discovery, and health diagnostics (`scripts/`).
- **`skills/adaptive-director/`:** The canonical, portable Agent Skill (procedural brain, runtime scripts, templates, references, and registry data).

```text
Adaptive-Director-Skill/
├── scripts/                      # Management & CLI layer
│   ├── cli.mjs                   # Main CLI router
│   ├── setup.mjs                 # Interactive host setup & delegate integration
│   ├── delegate-cli.mjs          # Delegate skills integration CLI
│   ├── install.mjs               # Idempotent skill copier
│   ├── refresh.mjs               # Safe config refresher
│   ├── discover.mjs              # Local agent & delegate discovery
│   ├── doctor.mjs                # Installation diagnostics
│   └── smoke-test.mjs            # Automated test suite
│
└── skills/adaptive-director/     # Portable Agent Skill (the brain)
    ├── SKILL.md                  # Procedural runbook
    ├── scripts/                  # Runtime scripts (route, run-state, resume)
    ├── references/               # Deep documentation & schemas
    ├── templates/                # Standardized phase brief templates
    ├── examples/                 # Realistic execution walkthroughs
    └── data/                     # Capability registry
```

---

## CLI Commands

```bash
adaptive-director run "Add input validation to the login flow"
adaptive-director setup               # Interactive: discover hosts, install Skill, configure delegate
adaptive-director setup --with-delegate # Setup and automatically install delegate-skills
adaptive-director setup --no-delegate   # Setup skipping delegate-skills (native execution)
adaptive-director delegate install    # Install delegate-skills via official installer
adaptive-director delegate status     # Check delegate-skills discovery and relay status
adaptive-director install             # Re-install/update Skill in host directories
adaptive-director refresh             # Re-discover hosts & update config (preserves overrides)
adaptive-director doctor              # Validate installation and health
adaptive-director help                # Show usage
```

---

## Core Principles

- **Dynamic Discovery:** Discovers installed host CLIs and inspects locally available models at runtime rather than assuming static pairings.
- **Routing Priority:** User overrides → Delegate fleet lanes → Dynamic Host Discovery → Capability registry → Default fallback.
- **Independent Review:** The coder never reviews its own work.
- **Verification Dimension:** Independent verification requires dedicated verification capabilities (`min_verification: 3`).
- **Max Reasoning Opt-in:** `max` effort is locked by default; requires `--allow-max`.
- **Runaway Loop Protection:** Maximum 1 automated fix cycle before alerting the user.
- **Context Isolation:** Each agent receives only a self-contained brief on disk (`.adaptive-director/runs/`), preventing context window bloat.
- **Zero Dependencies:** Runs on vanilla Node.js 18+.

---

## Dynamic Model Discovery & Heuristics

Adaptive Director does **not** rely on rigid, hardcoded host-to-model pairings. Real-world model availability depends on local CLI versions, host configurations, and account subscriptions.

### Routing Pipeline

```text
Detect Host CLI
       ↓
Discover Locally Available Models (cache / config / env)
       ↓
Resolve Aliases (e.g. 'astra' → 'gpt-6-astra')
       ↓
Intersect with Registry Capabilities & Phase Requirements
       ↓
Score Compatible Candidates for Current Phase
       ↓
Route to Optimal Candidate (with Graceful Fallback)
```

> [!NOTE]
> **Heuristic Calibration Disclaimer:** Capability scores (1–5) in `data/registry.json` represent internal routing heuristics and priors calibrated for phase allocation. They are **not** vendor laboratory benchmarks or absolute leaderboards.

---

## Configuration (`~/.adaptive-director/config.json`)

```json
{
  "version": 1,
  "defaultBudget": "balanced",
  "overrides": {
    "plan": "claude",
    "implement": "codex"
  }
}
```

---

## Upgrading

After a package upgrade, re-install the Skill into your host environments:

```bash
npm install -g adaptive-director-skill@latest
adaptive-director install
adaptive-director doctor
```

---

## Uninstalling

```bash
npm uninstall -g adaptive-director-skill
```

> **Note:** npm uninstall removes the package, but does **not** remove Skill copies that were installed into your coding-agent host directories. To clean those up, manually delete the `Adaptive-Director/` folder from each host skill directory (e.g. `~/.codex/skills/Adaptive-Director/`).

---

## License

MIT License © 2026 [Ahmed Tamer](https://github.com/tamourax). See [LICENSE](LICENSE) for details.

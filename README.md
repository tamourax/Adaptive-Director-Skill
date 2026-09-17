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

### 1. Install Globally

```bash
npm install -g adaptive-director-skill
```

### 2. Set Up

> `adaptive-director setup` registers the Skill with your coding-agent hosts, discovers available agents, detects optional delegate-skills integration, and creates the local Adaptive Director configuration.

```bash
adaptive-director setup
```

Or without a global install:

```bash
npx adaptive-director-skill setup
```

### 3. Verify

```bash
adaptive-director doctor
```

Expected output:
```
✓ Package installed
✓ SKILL.md exists
✓ references/ exists
✓ Registry exists
✓ Registry valid
✓ Config exists
✓ Config valid
✓ Routing script works
✓ Run state script exists
✓ codex detected
✓ Skill installed for codex

Ready.
```

### 4. Run with Your AI Agent

Load `SKILL.md` into your coding agent (Claude Code, Antigravity, Codex, etc.) and prompt:

```text
Use $adaptive-director-skill to implement Stripe checkout in Flutter
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

## CLI Commands

```bash
adaptive-director setup     # Interactive: discover hosts, install Skill, create config
adaptive-director install   # Re-install/update Skill in host directories
adaptive-director refresh   # Re-discover hosts & update config (preserves overrides)
adaptive-director doctor    # Validate installation and health
adaptive-director help      # Show usage
```

---

## Core Principles

- **Routing Priority:** User overrides → Delegate fleet lanes → Capability registry → Default fallback.
- **Independent Review:** The coder never reviews its own work.
- **Max Reasoning Opt-in:** `max` effort is locked by default; requires `--allow-max`.
- **Runaway Loop Protection:** Maximum 1 automated fix cycle before alerting the user.
- **Context Isolation:** Each agent receives only a self-contained brief on disk (`.adaptive-director/runs/`), preventing context window bloat.
- **Zero Dependencies:** Runs on vanilla Node.js 18+.

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

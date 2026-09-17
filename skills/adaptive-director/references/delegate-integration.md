# Delegate Integration Reference

## Overview

Delegate execution is **optional** and **disabled by default**.

```
Default:                   native execution
--delegate flag:           delegate execution allowed (not forced)
```

Adaptive Director always remains the top-level controller.
`delegate-skills` is the execution channel — never the orchestrator.

---

## How It Works

When `--delegate` is passed:

1. Adaptive Director reads the `delegate-skills` fleet config or discovers installed delegate skills
2. For each phase, it checks if a matching lane exists
3. If yes → dispatches the phase brief to that lane's implementer
4. If no  → falls back to native execution

```
Plan      → delegate or native (agy/claude)
Implement → delegate → codex (feature lane matches)
Review    → delegate or native (agy/claude)
Verify    → delegate or native (agy/gemini)
```

---

## delegate-skills Discovery & Config Locations

Adaptive Director dynamically searches for `delegate-skills` across multiple standard locations:

1. **YAML Fleet Configs:**
   - `./.delegate/fleet.yaml` (project root)
   - `~/.delegate/fleet.yaml` (user home)

2. **JSON Fleet Configs:**
   - `./.delegate/config.json` (project root)
   - `~/.config/delegate-skills/config.json` (canonical `delegate-setup` location)

3. **Installed Delegate Skills (Auto-Synthesized):**
   - `~/.agents/skills/` (e.g. `codex-delegate`, `agy-delegate`, `claude-delegate`, tracked via `.skill-lock.json`)
   - `~/.codex/skills/` (e.g. `delegate-review-loop`)

Example `fleet.yaml`:
```yaml
lanes:
  feature:
    implementer: codex
    model: gpt-6-astra
    effort: medium
  tests:
    implementer: agy
  ui:
    implementer: cursor
```

Adaptive Director reads these lanes during routing and maps them to phases by keyword:

| Phase | Matching Lane Keywords |
|-------|----------------------|
| implement | feature, impl, code, build |
| fix | fix, repair, feature |
| plan | plan, planning |
| review | review, check |
| verify | test, verify, qa |

---

## Installing delegate-skills

Adaptive Director integrates seamlessly with the official delegate-skills package:

- **Repository:** `https://github.com/amElnagdy/delegate-skills`
- **Official command:** `npx skills add amElnagdy/delegate-skills`

### Setup UX & Guided Flow

During `adaptive-director setup`, the setup engine detects whether `delegate-skills` is present:

1. **If already installed:**
   - Detects and lists all available relays (e.g. `codex-delegate`, `agy-delegate`).
   - Reuses existing installation without prompting or reinstalling.
2. **If missing:**
   - Prompts the user:
     ```text
     Install delegate-skills now?
     [Y] Install
     [N] Continue with native execution
     ```
   - If user confirms `Y`: calls the official installer `npx skills add amElnagdy/delegate-skills`.
   - If user rejects `N`: continues with native execution.
3. **CI / Non-interactive environments:**
   - Automatically skips optional installation and defaults to native execution, unless `--with-delegate` is explicitly provided.

### CLI Flags & Commands

```bash
# Setup with explicit delegate installation
adaptive-director setup --with-delegate

# Setup bypassing delegate installation
adaptive-director setup --no-delegate

# Install delegate skills directly
adaptive-director delegate install

# Inspect delegate integration status and discovered relays
adaptive-director delegate status
```

### Failure Resilience

- **Non-blocking installer errors:** If `npx skills add` exits non-zero, Adaptive Director logs a clear failure message and continues setup with native execution active.
- **Verification check:** If the installer exits 0 but no delegate relays are discovered, Adaptive Director marks the attempt as `unverified` and maintains native execution.
- **Config persistence:** Config stores `delegate: { installed, enabled: false, lastInstallAttempt }` and preserves all user overrides. Native execution remains default.

---

## Relay Location

The routing engine looks for relay scripts at:

```
~/.agents/skills/<agent>-delegate/scripts/relay.mjs
./.skills/amElnagdy/delegate-skills/skills/<agent>-delegate/scripts/relay.mjs
~/.skills/amElnagdy/delegate-skills/skills/<agent>-delegate/scripts/relay.mjs
```

---

## Delegate Rule (MVP)

> One delegated executor per phase maximum.

The delegate should receive a focused brief and return a structured result.
It must NOT start its own orchestration loop.

```
Director → brief → Delegate → result.json → Director
```

The delegate NEVER commits. Committing belongs to the user.

---

## Runtime Flags

```bash
# Enable delegate
adaptive-director --delegate "Implement Stripe in Flutter"

# Delegate + max reasoning
adaptive-director --delegate --allow-max "Refactor payment architecture"

# Dry run (shows routing, no execution)
adaptive-director --dry-run --delegate "Implement Stripe in Flutter"
```

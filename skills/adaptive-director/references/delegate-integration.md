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

```bash
npx skills add amElnagdy/delegate-skills
```

Or specific skills:
```bash
npx skills add amElnagdy/delegate-skills --skill codex-delegate
npx skills add amElnagdy/delegate-skills --skill agy-delegate
```

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

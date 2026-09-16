# Delegate Integration Reference

## Overview

Delegate execution is **optional** and **disabled by default**.

```
Default:                   native execution
--delegate flag:           delegate execution allowed (not forced)
```

Adaptive Orchestrator always remains the top-level controller.
`delegate-skills` is the execution channel — never the orchestrator.

---

## How It Works

When `--delegate` is passed:

1. Adaptive Orchestrator reads the `delegate-skills` fleet config
2. For each phase, it checks if a matching lane exists
3. If yes → dispatches the phase brief to that lane's implementer
4. If no  → falls back to native execution

```
Plan     → native claude (no planning lane)
Implement → delegate → codex (feature lane matches)
Review   → native claude (no review lane)
Verify   → native claude (no verify lane)
```

---

## delegate-skills Fleet Config

Location: `~/.delegate/fleet.yaml` or `./.delegate/fleet.yaml`

Example:
```yaml
lanes:
  feature:
    implementer: codex
    model: o4-mini
    effort: medium
  tests:
    implementer: aider
  ui:
    implementer: cursor
```

Adaptive Orchestrator reads these lanes during routing and maps them to phases by keyword:

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
npx skills add amElnagdy/delegate-skills --skill claude-delegate
```

---

## Relay Location

The routing engine looks for relay scripts at:

```
./.skills/amElnagdy/delegate-skills/skills/<agent>-delegate/scripts/relay.mjs
~/.skills/amElnagdy/delegate-skills/skills/<agent>-delegate/scripts/relay.mjs
```

---

## Delegate Rule (MVP)

> One delegated executor per phase maximum.

The delegate should receive a focused brief and return a structured result.
It must NOT start its own orchestration loop.

```
Orchestrator → brief → Delegate → result.json → Orchestrator
```

The delegate NEVER commits. Committing belongs to the reviewer (you).

---

## Runtime Flags

```bash
# Enable delegate
adaptive-orchestrator --delegate "Implement Stripe in Flutter"

# Delegate + max reasoning
adaptive-orchestrator --delegate --allow-max "Refactor payment architecture"

# Dry run (shows routing, no execution)
adaptive-orchestrator --dry-run --delegate "Implement Stripe in Flutter"
```

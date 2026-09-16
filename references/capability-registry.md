# Capability Registry Reference

## Overview

The capability registry assigns numeric scores to known models and defines minimum requirements per phase.

All scores are 1–5:

| Score | Meaning |
|-------|---------|
| 1 | Weak — unreliable for this capability |
| 2 | Limited — acceptable only for simple tasks |
| 3 | Acceptable — meets baseline requirements |
| 4 | Strong — reliable for most tasks |
| 5 | Excellent — best available |

---

## Registry File

Location: `data/registry.json`

```json
{
  "models": {
    "claude-sonnet-4-5": { "planning": 4, "coding": 4, "review": 4 },
    "codex-default":     { "planning": 2, "coding": 5, "review": 2 },
    "unknown":           { "planning": 1, "coding": 1, "review": 1 }
  },
  "phase_requirements": {
    "plan":      { "min_planning": 3 },
    "implement": { "min_coding": 2 },
    "review":    { "min_review": 3 },
    "fix":       { "min_coding": 2 },
    "verify":    { "min_planning": 2 }
  }
}
```

---

## Phase Requirements

| Phase | Minimum Requirement |
|-------|-------------------|
| plan | planning ≥ 3 |
| implement | coding ≥ 2 |
| review | review ≥ 3 |
| fix | coding ≥ 2 |
| verify | planning ≥ 2 |

---

## Priority Chain

The routing script applies this order:

```
1. User explicit override  (config.yaml agentOverrides.*)
2. Delegate lane preference (fleet.yaml, only when --delegate)
3. Built-in registry        (best available agent by score)
4. Fallback                 (claude)
```

---

## User Override (config.yaml)

```yaml
agentOverrides.plan:      claude
agentOverrides.implement: codex
agentOverrides.review:    claude
agentOverrides.verify:    claude
```

Uncomment lines in `~/.adaptive-orchestrator/config.yaml` to activate.

---

## Adding a New Model

Edit `data/registry.json` and add an entry under `models`:

```json
"my-custom-model": {
  "planning": 3,
  "coding":   4,
  "review":   3
}
```

Then set `ADAPTIVE_CURRENT_MODEL=my-custom-model` in your environment.

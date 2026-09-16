# Handoff Schema Reference

## Overview

Every run gets an isolated workspace. Agents communicate through files — not shared chat history.

```
.adaptive-orchestrator/runs/<run-id>/
├── metadata.json       ← machine-readable run state
├── task.md             ← original task (human + machine)
├── plan.md             ← planner output (human readable)
├── plan.json           ← planner output (machine contract)
├── implementation.md   ← implementer report (human readable)
├── implementation.json ← implementer report (machine contract)
├── review.md           ← reviewer findings (human readable)
├── review.json         ← reviewer findings (machine contract)
└── final.md / final.json ← verification result
```

---

## metadata.json

```json
{
  "runId":        "run-abc123",
  "task":         "Implement Stripe in Flutter",
  "status":       "running",
  "currentPhase": "review",
  "size":         "medium",
  "budget":       "balanced",
  "allowMax":     false,
  "useDelegate":  false,
  "routing":      [],
  "startedAt":    "2026-09-17T01:00:00Z",
  "updatedAt":    "2026-09-17T01:15:00Z"
}
```

### RunStatus values

| Status | Meaning |
|--------|---------|
| pending | initialized, not started |
| running | currently executing |
| verified | completed successfully |
| blocked | review or verify failed after max cycles |
| failed | agent returned an error |
| interrupted | stopped mid-run (can resume) |

---

## Phase JSON Contract

All phase results follow this schema:

```json
{
  "phase":   "review",
  "status":  "completed",
  "summary": "Found 1 critical issue...",
  "findings": [
    {
      "severity":    "critical",
      "title":       "Duplicate PaymentIntent confirmation",
      "file":        "lib/payment_service.dart",
      "description": "PaymentIntent.confirm() is called twice on retry."
    }
  ],
  "touchedFiles": ["lib/payment_service.dart"],
  "sessionId":    "sess-xyz"
}
```

### severity values

| Value | Behavior |
|-------|---------|
| critical | Must fix — triggers fix loop |
| warning | Report and continue |
| suggestion | Informational only |

---

## Managing State with run-state.mjs

### Init a run
```bash
node scripts/run-state.mjs init \
  --task "Implement Stripe in Flutter" \
  --size medium \
  --budget balanced
```

### Update status
```bash
node scripts/run-state.mjs update --run-id run-abc123 --status running --phase plan
```

### Write a phase result
```bash
node scripts/run-state.mjs write-phase \
  --run-id run-abc123 \
  --phase review \
  --status completed \
  --summary "Found 1 critical issue" \
  --findings-json '[{"severity":"critical","title":"...","description":"..."}]'
```

### Read a phase result
```bash
node scripts/run-state.mjs read-phase --run-id run-abc123 --phase review
```

### Build a brief for a phase
```bash
node scripts/run-state.mjs build-brief --run-id run-abc123 --phase implement
```

### List all runs
```bash
node scripts/run-state.mjs list
```

---

## Brief Format (what each agent receives)

Each agent receives ONLY what it needs — not the full chat history.

| Phase | Receives |
|-------|---------|
| plan | task.md + instructions |
| implement | task.md + plan.md + instructions |
| review | task.md + plan.md + implementation.md + instructions |
| fix | task.md + review.md + instructions |
| verify | task.md + plan.md + instructions |

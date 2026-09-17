# Routing Rules Reference

## Task Classification

Initial classification uses keyword heuristics:

| Size | Examples |
|------|---------|
| small | rename, fix typo, update text, minor fix, change color |
| medium | Stripe integration, password reset, new API, module refactor |
| large | architecture refactor, auth system, payment architecture, migration |

Default when no keyword matches: **medium**

### Reclassification

After the Planner inspects the repository, it appends a JSON block to its plan:

```json
{"recommended_size": "large", "reason": "discovered webhooks + saved cards + refunds"}
```

If `recommended_size` differs from initial, Adaptive Orchestrator reclassifies and rebuilds the routing table.

---

## Phase Map

| Task Size | Phases |
|-----------|--------|
| small | implement → review |
| medium | plan → implement → review → verify |
| large | plan → implement → review → [fix] → verify |

`fix` only runs if review finds CRITICAL issues.

---

## Effort Table

| Phase | conservative | balanced | quality |
|-------|-------------|---------|---------|
| plan | medium | high | high |
| implement | medium | medium | medium |
| review | high | high | high |
| fix | medium | medium | medium |
| verify | medium | medium | high |

`max` is never used unless `--allow-max` is passed AND the routing engine selects it.

---

## Agent Priority

### For planning/review/verify phases:
```
claude → agy → gemini → opencode → cursor → cline → copilot → aider → codex
```

### For implementation/fix phases:
```
codex → aider → opencode → cursor → cline → claude → agy → copilot → gemini
```

The first agent in the list whose representative model meets the phase requirement is selected.

---

## Execution Mode

| Condition | Execution |
|-----------|-----------|
| Default | native |
| `--delegate` + matching fleet lane | delegate |
| `--delegate` + no matching lane | native (fallback) |

---

## Using route.mjs

```bash
echo '{
  "taskSize": "medium",
  "phase": "review",
  "budget": "balanced",
  "allowMax": false,
  "delegateEnabled": false
}' | node scripts/route.mjs
```

Returns:
```json
{
  "agent": "claude",
  "model": "claude-sonnet-4-5",
  "effort": "high",
  "execution": "native"
}
```

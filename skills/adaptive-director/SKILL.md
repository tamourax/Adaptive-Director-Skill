---
name: adaptive-director
description: >-
  Adaptive multi-agent director for coding tasks. Use this skill whenever the user
  asks to implement features, fix complex bugs, refactor architecture, or coordinate
  multiple coding agents across planning, implementation, independent review, and verification phases.
version: 1.1.1
---

# Adaptive Director Skill

> **One task in. The right agents take it from there.**

---

## What This Skill Does

When you invoke this skill with a coding task, you:

1. Classify the task
2. Determine which phases to run
3. Route each phase to the right agent, model, and effort level
4. Execute phases using handoff files (not shared chat history)
5. Handle review findings (fix critical issues once, then re-review)
6. Verify the result
7. Produce a final status report

You do NOT implement, review, or verify yourself unless you are the best available agent for those phases and the routing engine assigns you.

---

## Core Rules

<critical_rules>
1. Max reasoning is DISABLED by default.
   → Only use if --allow-max was passed.

2. Delegate execution is DISABLED by default.
   → Only use if --delegate was passed.

3. Native agents/sub-agents are preferred.

4. Review MUST be independent.
   → The reviewer must not be the same execution context that implemented.

5. Critical findings MUST be fixed before verification.

6. Warning findings are reported but do not block.

7. Suggestion findings are informational only.

8. Maximum 1 automatic fix/re-review cycle.
   → If critical issues remain after re-review → Status: Blocked.

9. Never commit. Committing belongs to the user.

10. Never guess unavailable agent capabilities.
    → If unknown, mark as unknown.
</critical_rules>

---

## How to Start a Run

### Step 1: Read user input

Extract:
- Task description
- Flags: `--budget`, `--delegate`, `--allow-max`, `--dry-run`
- Default budget: `balanced`

### Step 2: Classify the task

Run initial heuristic classification:

```bash
# Small: rename, fix typo, update text, minor fix, change color/label
# Medium: integration, API feature, module refactor, password reset
# Large: architecture refactor, auth redesign, migration, payment system
```

Use the heuristic. Do NOT call an agent for classification yet.
The Planner will reclassify after repo inspection if needed.

### Step 3: Get routing for each phase

For EACH phase in the task's phase list, call `route.mjs`:

```bash
echo '{
  "taskSize": "medium",
  "phase": "plan",
  "budget": "balanced",
  "allowMax": false,
  "delegateEnabled": false
}' | node scripts/route.mjs
```

`route.mjs` returns:
```json
{
  "agent": "claude",
  "model": "claude-sonnet-4-5",
  "effort": "high",
  "execution": "native"
}
```

Repeat for all phases. Build a routing table.

### Step 4: Dry run check

If `--dry-run` was passed:
- Print the routing table
- Exit. No execution.

### Step 5: Init run workspace

```bash
node scripts/run-state.mjs init \
  --task "Implement Stripe in Flutter" \
  --size medium \
  --budget balanced
```

Returns `{ "runId": "run-abc123", "workspacePath": "..." }`.
Save the `runId`. You will use it for all subsequent operations.

### Step 6: Execute phases

See the **Phase Execution** section below.

---

## Phase Map

| Task Size | Phases |
|-----------|--------|
| small | implement → review |
| medium | plan → implement → review → verify |
| large | plan → implement → review → [fix if critical] → verify |

---

## Phase Execution

Execute phases in order. For each phase:

### 1. Update metadata
```bash
node scripts/run-state.mjs update \
  --run-id run-abc123 \
  --status running \
  --phase plan
```

### 2. Build the brief
```bash
node scripts/run-state.mjs build-brief \
  --run-id run-abc123 \
  --phase plan
```

The brief is a self-contained prompt generated from standardized templates in `templates/` (`plan-brief.md`, `implement-brief.md`, `review-brief.md`, `fix-brief.md`, `verify-brief.md`).
Pass it to the assigned agent.
**Do not share full chat history with the agent — use the brief only.**
See `examples/clean-run-walkthrough.md` and `examples/critical-fix-cycle-walkthrough.md` for complete reference runs.

### 3. Execute the phase

Use the routing decision from Step 3 above:

- `execution: native` → use a native sub-agent or spawn the agent CLI
- `execution: delegate` → use `delegate-skills` relay for the assigned agent

Pass the brief as the task for the agent.

### 4. Write the phase result

After the agent completes, write its output:

```bash
node scripts/run-state.mjs write-phase \
  --run-id run-abc123 \
  --phase plan \
  --status completed \
  --summary "<agent output>"
```

If the phase is `review` or `fix`, also parse findings and include:
```bash
  --findings-json '[{"severity":"critical","title":"...","description":"...","file":"..."}]'
```

---

## Special Phase: Plan + Reclassification

After the **plan** phase completes:

1. Look for a JSON block at the end of the planner's output:
   ```json
   {"recommended_size": "large", "reason": "..."}
   ```

2. If `recommended_size` differs from the initial classification:
   - Log: `Reclassified: medium → large (reason)`
   - Rebuild the routing table for the new size
   - Update metadata

3. Continue with the updated phase list and routing.

---

## Special Phase: Review

After the **review** phase:

1. Parse findings from the review output.
   Look for lines like:
   ```
   [CRITICAL] <title>
   [WARNING]  <title>
   [SUGGESTION] <title>
   ```

2. Write phase result with findings JSON:
```bash
node scripts/run-state.mjs write-phase \
  --run-id run-abc123 \
  --phase review \
  --status completed \
  --summary "Completed review" \
  --findings-json '[...]'
```

3. Evaluate review findings via CLI or inspect returned counts:
```bash
node scripts/run-state.mjs eval-review --run-id run-abc123
```

**Decision Logic:**
```text
critical_count > 0
→ Fix
→ Re-review

critical_count == 0
→ Verify
(Warnings > 0 and suggestions > 0 are logged in the report but do NOT trigger Fix cycle)
```

---

## Fix Loop

Maximum: **1 automatic cycle**. Triggered ONLY if `critical_count > 0`.

### Fix phase

```bash
node scripts/run-state.mjs build-brief --run-id run-abc123 --phase fix
```

Execute with the assigned fix agent. The brief includes the previous review.

### Re-review

Build and execute a new review brief. Parse findings again.

```
Re-review: Critical still found?
├── No  → continue to Verify
└── Yes → Status: Blocked
          Report remaining issues to user.
          STOP.
```

---

## Special Phase: Verify

Run project-appropriate verification commands:

| Project Type | Detected by | Commands |
|-------------|------------|---------|
| Flutter | `pubspec.yaml` | `flutter analyze`, `flutter test` |
| Node.js | `package.json` | `npm test`, `npm run build` |
| Laravel | `composer.json` | `php artisan test` |
| Python | `pyproject.toml` or `requirements.txt` | `pytest` |
| Unknown | (none) | skip |

If commands pass → `Status: Verified`
If commands fail → `Status: Blocked`

Write final result:
```bash
node scripts/run-state.mjs write-phase \
  --run-id run-abc123 \
  --phase verify \
  --status completed \
  --summary "flutter analyze: passed. flutter test: 42 tests passed."
```

---

## Final Report

Print a clean summary:

```
  Adaptive Orchestrator

  Task:    Implement Stripe in Flutter
  Run ID:  run-abc123
  Size:    medium
  Budget:  balanced

  Execution:
  ✓ Plan completed
  ✓ Implementation completed
  ⚠ Review found 1 CRITICAL issue
  ✓ Fix completed
  ✓ Re-review passed
  ✓ Verification passed

  Status: Verified
```

Or if blocked:
```
  Status: Blocked

  Remaining critical issue:
  [CRITICAL] PaymentIntent confirmed twice
  File: lib/payment_service.dart
  PaymentIntent.confirm() is called twice on retry...
```

---

## Resume a Run

If a run was interrupted:

```bash
node scripts/resume.mjs
```

Returns the most recent interrupted run's metadata (or null).

Use `currentPhase` from metadata to determine where to continue.
Rebuild briefs using `run-state.mjs build-brief` for remaining phases.

---

## Coordinator-Only Mode

If the current agent's model is below the minimum capability for critical phases:

```
Current model planning score < 3  (required for plan)
Current model review score   < 3  (required for review)
→ Role: Coordinator Only
```

In Coordinator-Only mode:
- Do NOT plan or review yourself
- Dispatch ALL critical phases to stronger agents via routing
- Only: pass briefs, receive results, update run state, report outcome

The routing engine already handles this — it will NOT select a weak model for planning or review.

---

## What This Skill Does NOT Do

```
✗ Self-learning
✗ Automatic quota detection
✗ Cost prediction
✗ Multiple delegates per phase
✗ Unlimited review loops
✗ Automatic rollback
✗ Cloud features
```

---

## Quick Reference

| Script | Purpose |
|--------|---------|
| `scripts/discover.mjs` | Detect installed agents and delegate fleet |
| `scripts/setup.mjs` | Interactive setup + config write |
| `scripts/route.mjs` | Deterministic routing (stdin JSON → stdout JSON) |
| `scripts/run-state.mjs` | Run workspace: init, update, read, write, brief |
| `scripts/resume.mjs` | Find and return interrupted run |

| Reference | Content |
|-----------|---------|
| `references/capability-registry.md` | Score definitions, phase requirements |
| `references/routing-rules.md` | Classification, effort table, agent priority |
| `references/handoff-schema.md` | File schemas, run-state.mjs usage |
| `references/delegate-integration.md` | Delegate setup and rules |

---

## One-Line Description

> **Give Adaptive Director one coding task. It routes every phase to the right agent, model, and reasoning effort automatically.**
